import pytest
from dataclasses import replace
import httpx

from camp_import.common import ApiRequest, ApiResponse, FakeTransport, RetryingTransport, RetryExhausted, TokenBucket, TransportError, read_csv_rows, write_csv_atomic
from camp_import.field_mapping import ContractViolation, FieldMappingError, extract_path, load_field_mapping
from camp_import.tiles import can_split, split_tile, tile_from_center
from camp_import.discover import DiscoverEngine, TileStore
from camp_import.field_mapping import FieldMapping
from camp_import.fetch_detail import DetailEngine, DetailStore
from camp_import.normalize import dedup_camps, merge_details, raw_hash
from camp_import import cli
from camp_import.seed_strategy import SeedSpec
from camp_import.probe import ProbeRequestProfile, analyze_probe_results, assess_qps_batch, build_probe_plan, infer_candidate_mapping, plan_viewport_boundary, plan_zero_result_confirmation, run_probe


def test_atomic_csv_replaces_and_keeps_old_on_row_error(tmp_path):
    path = tmp_path / "out.csv"
    write_csv_atomic(path, ["a"], [{"a": "old"}])
    def broken():
        yield {"a": "partial"}
        raise RuntimeError("boom")
    with pytest.raises(RuntimeError): write_csv_atomic(path, ["a"], broken())
    assert read_csv_rows(path) == [{"a": "old"}]
    assert not list(tmp_path.glob("*.tmp"))


def test_retry_backoff_and_eventual_success():
    waits = []
    transport = RetryingTransport(FakeTransport([TransportError("reset"), ApiResponse(503), ApiResponse(200, body={})]), sleep=waits.append)
    assert transport.send(ApiRequest("GET", "https://example.test")) .status_code == 200
    assert waits == [1.0, 2.0]


def test_retry_after_is_capped_at_thirty_seconds():
    waits = []
    transport = RetryingTransport(FakeTransport([ApiResponse(429, {"Retry-After": "120"}), ApiResponse(200)]), sleep=waits.append)
    assert transport.send(ApiRequest("GET", "https://example.test")).status_code == 200
    assert waits == [30.0]


def test_retry_exhaustion_preserves_last_error():
    waits = []
    transport = RetryingTransport(FakeTransport([TransportError("reset")] * 6), sleep=waits.append)
    with pytest.raises(RetryExhausted, match="network: reset"):
        transport.send(ApiRequest("GET", "https://example.test"))
    assert waits == [1.0, 2.0, 4.0, 8.0, 16.0]


def test_live_transport_mock_preserves_profile_headers():
    from camp_import.common import LiveTransport, REQUEST_HEADERS
    seen = {}
    def handler(request):
        seen["xhr"] = request.headers.get("xweb_xhr")
        return httpx.Response(200, json={"ok": True})
    transport = LiveTransport(httpx.Client(headers=REQUEST_HEADERS, transport=httpx.MockTransport(handler)))
    assert transport.send(ApiRequest("GET", "https://example.test")).body == {"ok": True}
    assert seen["xhr"] == "1"


def test_token_bucket_waits_for_second_token():
    now = [0.0]; waits = []
    bucket = TokenBucket(2, clock=lambda: now[0], sleep=lambda value: (waits.append(value), now.__setitem__(0, now[0] + value)))
    bucket.acquire(); bucket.acquire()
    assert waits == [pytest.approx(.5)]


def test_token_bucket_burst_allows_initial_requests():
    now = [0.0]; waits = []
    bucket = TokenBucket(1, burst=3, clock=lambda: now[0], sleep=lambda value: (waits.append(value), now.__setitem__(0, now[0] + value)))
    bucket.acquire(); bucket.acquire(); bucket.acquire(); bucket.acquire()
    assert waits == [1.0]


def test_contract_path_is_strict():
    assert extract_path({"a": {"b": 1}}, "a.b") == 1
    with pytest.raises(ContractViolation): extract_path({"a": {}}, "a.b")


def test_quadtree_split_preserves_area_and_depth_limit():
    root = tile_from_center(104, 30.6, 40000, 30000, 11)
    children = split_tile(root)
    assert len(children) == 4 and all(child.depth == 1 for child in children)
    assert can_split(root, 1, 8)
    assert not can_split(root, 1, 0)


def mapping():
    return FieldMapping("data.list", "id", "latitude", "longitude", "data.id", "lnt", "lat", "oldlnt", "oldlat", "scale", "id", "lnt", "lat", 5, "gcj02", 1, 11, {"11": {"width_m": 40000, "height_m": 30000}, "12": {"width_m": 20000, "height_m": 15000}}, {"11": .15, "12": .15}, .1, 1, empty_sample_ratio=0)


def camps(ids, lng=104, lat=30.6):
    return ApiResponse(200, body={"data": {"list": [{"id": value, "longitude": lng, "latitude": lat} for value in ids]}})


def test_discover_dedups_and_expands_edge(tmp_path):
    store = TileStore(tmp_path / "tiles.csv")
    engine = DiscoverEngine(mapping(), FakeTransport([camps(["1", "1", "2"], 104.19), camps([], 104.55)]), store, tmp_path / "raw/camps.jsonl", 1, 1)
    engine.seed([(104, 30.6)], "510000")
    engine.run()
    rows = store.rows()
    assert rows[0].new_id_count == 2
    assert len([row for row in rows if row.scale == 11]) == 2


def test_discover_samples_pruned_empty_leaves(tmp_path):
    store = TileStore(tmp_path / "tiles.csv")
    engine = DiscoverEngine(replace(mapping(), empty_sample_ratio=1), FakeTransport([camps(["1", "2", "3", "4"])] * 85), store, tmp_path / "camps.jsonl", 1, 3)
    engine.seed([(104, 30.6)], "510000")
    engine.run()
    assert any(row.depth == 3 for row in store.rows())


def test_discover_preserves_sparse_profile_through_splits_and_edges(tmp_path):
    store = TileStore(tmp_path / "tiles.csv")
    engine = DiscoverEngine(mapping(), FakeTransport([camps(["1", "2", "3", "4", "5"], 104.19)] + [camps([])] * 8), store, tmp_path / "camps.jsonl", 1, 1)
    engine.seed([(104, 30.6, 11, "sparse")], "510000")
    engine.run()
    assert {row.density_profile for row in store.rows()} == {"sparse"}


def test_tile_store_defaults_legacy_profile_to_unknown(tmp_path):
    path = tmp_path / "tiles.csv"
    row = {"province_code":"510000", "tile_id":"legacy", "parent_tile_id":"", "center_lng":"1", "center_lat":"2", "old_lng":"1", "old_lat":"2", "min_lng":"0", "min_lat":"1", "max_lng":"2", "max_lat":"3", "scale":"11", "depth":"0", "status":"done", "attempts":"1", "discovered_count":"0", "new_id_count":"0", "last_error":"", "started_at":"", "updated_at":""}
    write_csv_atomic(path, list(row), [row])
    assert TileStore(path).get("legacy").density_profile == "unknown"


def test_discover_truncation_signal_splits(tmp_path):
    store = TileStore(tmp_path / "tiles.csv")
    response = ApiResponse(200, body={"data":{"list":[], "truncated": True}})
    empty = ApiResponse(200, body={"data":{"list":[], "truncated": False}})
    engine = DiscoverEngine(replace(mapping(), truncation_signal_path="data.truncated"), FakeTransport([response] + [empty] * 4), store, tmp_path / "camps.jsonl", 1, 1)
    engine.seed([(104, 30.6)], "510000")
    engine.run()
    assert len(store.rows()) == 5


def test_detail_engine_persists_and_checks_response_id(tmp_path):
    store = DetailStore(tmp_path / "details.csv")
    store.seed_tasks([{"external_id": "1", "lng": 104, "lat": 30.6}])
    engine = DetailEngine(mapping(), FakeTransport([ApiResponse(200, body={"data": {"id": "1"}})]), store, tmp_path / "details.jsonl")
    engine.run()
    assert store.get("1").status == "done"


def test_stale_running_tile_is_retried(tmp_path):
    store = TileStore(tmp_path / "tiles.csv", clock=lambda: 1000)
    from camp_import.discover import TileRow
    item = TileRow.from_tile(tile_from_center(104, 30.6, 1, 1, 11), "510000")
    item.status, item.started_at = "running", "399"
    store.add(item); store.save()
    assert store.reset_stale_running() == 1
    assert store.get(item.tile_id).status == "retry"


def test_stale_running_detail_is_retried(tmp_path):
    store = DetailStore(tmp_path / "details.csv", clock=lambda: 1000)
    store.seed_tasks([{"external_id": "1", "lng": 104, "lat": 30.6}])
    task = store.get("1"); task.status, task.started_at = "running", "399"; store.save()
    assert store.reset_stale_running() == 1
    assert store.get("1").status == "retry"


def test_failed_detail_can_be_explicitly_requeued(tmp_path):
    store = DetailStore(tmp_path / "details.csv")
    store.seed_tasks([{"external_id": "1", "lng": 104, "lat": 30.6}])
    task = store.get("1"); store.mark_failed(task, "http 503")
    assert store.requeue_failed() == 1
    assert store.get("1").status == "retry"


def test_failed_tile_can_be_explicitly_requeued(tmp_path):
    store = TileStore(tmp_path / "tiles.csv")
    from camp_import.discover import TileRow
    item = TileRow.from_tile(tile_from_center(104, 30.6, 1, 1, 11), "510000")
    store.add(item); store.mark_failed(item, "network")
    assert store.requeue_failed() == 1
    assert store.get(item.tile_id).status == "retry"


def test_detail_response_id_mismatch_is_contract_violation(tmp_path):
    store = DetailStore(tmp_path / "details.csv")
    store.seed_tasks([{"external_id": "1", "lng": 104, "lat": 30.6}])
    engine = DetailEngine(mapping(), FakeTransport([ApiResponse(200, body={"data": {"id": "2"}})]), store, tmp_path / "details.jsonl")
    with pytest.raises(ContractViolation): engine.run()


def test_normalize_merges_optional_detail_fields():
    raw = [{"tile_id": "t", "fetched_at": 1, "response": {"data": {"list": [{"id": "1", "longitude": 104, "latitude": 30.6}]}}}]
    rows = dedup_camps(raw, mapping())
    assert merge_details(rows, [], mapping(), "510000")[0]["source"] == "55camp"


def test_raw_hash_is_key_order_independent():
    assert raw_hash({"a": 1, "b": [2]}) == raw_hash({"b": [2], "a": 1})


def test_cli_refuses_live_commands_without_flag(tmp_path, capsys):
    assert cli.main(["--data-dir", str(tmp_path), "discover", "--province-code", "510000", "--seed-centers", str(tmp_path / "seeds.csv")]) == 2
    assert "field_mapping" in capsys.readouterr().err


def test_cli_probe_requires_live_after_explicit_profile(tmp_path, capsys):
    args = ["--data-dir", str(tmp_path), "probe", "--province-code", "510000", "--center-lng", "1", "--center-lat", "2"]
    for key, value in {"items-path":"data.list", "external-id-path":"id", "lat-path":"latitude", "lng-path":"longitude", "list-lng-param":"lnt", "list-lat-param":"lat", "list-old-lng-param":"oldlnt", "list-old-lat-param":"oldlat", "list-scale-param":"scale", "detail-id-param":"id", "detail-lng-param":"lnt", "detail-lat-param":"lat"}.items(): args.extend(["--" + key, value])
    assert cli.main(args) == 2
    assert "禁用" in capsys.readouterr().err


def test_cli_normalize_runs_without_live(tmp_path):
    import yaml
    from camp_import.common import append_jsonl
    province = tmp_path / "510000"
    cfg = {
        "list_items_path":"data.list", "list_external_id_path":"id", "list_lat_path":"latitude", "list_lng_path":"longitude", "detail_external_id_path":"data.id",
        "list_lng_param":"lnt", "list_lat_param":"lat", "list_old_lng_param":"oldlnt", "list_old_lat_param":"oldlat", "list_scale_param":"scale", "detail_id_param":"id", "detail_lng_param":"lnt", "detail_lat_param":"lat",
        "response_item_limit":5, "coordinate_system":"gcj02", "qps_limit":1, "seed_scale":11, "scale_viewport":{"11":{"width_m":1,"height_m":1}}, "overlap_ratio_by_scale":{"11":.1}, "edge_margin_ratio":.1, "edge_expansion_max_hops":1,
    }
    (province / "probe").mkdir(parents=True)
    (province / "probe/field_mapping.yaml").write_text(yaml.safe_dump(cfg), encoding="utf-8")
    append_jsonl(province / "raw/camps.jsonl", {"tile_id":"t", "response":{"data":{"list":[{"id":"1", "longitude":104, "latitude":30.6}]}}})
    assert cli.main(["--data-dir", str(tmp_path), "normalize", "--province-code", "510000"]) == 0
    assert "55camp" in (province / "processed/camps_enriched.csv").read_text(encoding="utf-8")


def test_cli_retry_failed_option_is_available():
    parsed = cli.parser().parse_args(["discover", "--province-code", "510000", "--seed-centers", "seeds.csv", "--retry-failed"])
    assert parsed.retry_failed is True


def test_mapping_refuses_missing_required_key(tmp_path):
    path = tmp_path / "mapping.yaml"
    path.write_text("list_items_path: data.list\n", encoding="utf-8")
    with pytest.raises(FieldMappingError): load_field_mapping(path)


def test_mapping_refuses_invalid_numeric_ranges(tmp_path):
    data = {
        "list_items_path":"data.list", "list_external_id_path":"id", "list_lat_path":"lat", "list_lng_path":"lng", "detail_external_id_path":"data.id",
        "list_lng_param":"lnt", "list_lat_param":"lat", "list_old_lng_param":"oldlnt", "list_old_lat_param":"oldlat", "list_scale_param":"scale", "detail_id_param":"id", "detail_lng_param":"lnt", "detail_lat_param":"lat",
        "response_item_limit":5, "coordinate_system":"gcj02", "qps_limit":0, "seed_scale":11, "scale_viewport":{"11":{"width_m":1,"height_m":1}}, "overlap_ratio_by_scale":{"11":.1}, "edge_margin_ratio":.1, "edge_expansion_max_hops":1,
    }
    path = tmp_path / "mapping.yaml"
    import yaml
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    with pytest.raises(FieldMappingError): load_field_mapping(path)


def test_mapping_requires_a_verified_limit_or_explicit_split_threshold(tmp_path):
    data = {
        "list_items_path":"data.list", "list_external_id_path":"id", "list_lat_path":"lat", "list_lng_path":"lng", "detail_external_id_path":"data.id",
        "list_lng_param":"lnt", "list_lat_param":"lat", "list_old_lng_param":"oldlnt", "list_old_lat_param":"oldlat", "list_scale_param":"scale", "detail_id_param":"id", "detail_lng_param":"lnt", "detail_lat_param":"lat",
        "coordinate_system":"gcj02", "qps_limit":1, "seed_scale":11, "scale_viewport":{"11":{"width_m":1,"height_m":1}}, "overlap_ratio_by_scale":{"11":.1}, "edge_margin_ratio":.1, "edge_expansion_max_hops":1,
    }
    path = tmp_path / "mapping.yaml"
    import yaml
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    with pytest.raises(FieldMappingError): load_field_mapping(path)
    data["split_item_threshold"] = 7
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    assert load_field_mapping(path).split_threshold_for_scale(11) == 7




def test_probe_uses_profile_and_reports_contract_failure():
    profile = ProbeRequestProfile("data.list", "id", "lat", "lng", "x", "y", "ox", "oy", "z", "id", "lng", "lat")
    plan = build_probe_plan(1, 2, [11], profile, repeats=1)
    assert plan[0].params["x"] == "1.000000"
    findings = analyze_probe_results([(plan[0], ApiResponse(200, body={"data": {}}))], profile)
    assert findings.errors and "contract" in findings.errors[0]


def test_probe_never_overwrites_existing_mapping(tmp_path):
    profile = ProbeRequestProfile("data.list", "id", "lat", "lng", "x", "y", "ox", "oy", "z", "id", "lng", "lat")
    probe_dir = tmp_path / "probe"; probe_dir.mkdir()
    (probe_dir / "field_mapping.yaml").write_text("reviewed: true\n", encoding="utf-8")
    run_probe(FakeTransport([ApiResponse(200, body={"data":{"list":[]}})] * 3), build_probe_plan(1, 2, [11], profile, repeats=1), profile, probe_dir)
    assert (probe_dir / "field_mapping.yaml").read_text(encoding="utf-8") == "reviewed: true\n"
    assert (probe_dir / "probe_responses.jsonl").exists()


def test_qps_assessment_stops_on_rate_limit_or_latency_regression():
    assert assess_qps_batch(2, [200, 429], [10, 12]).should_stop
    result = assess_qps_batch(2, [200] * 10, [20] * 10, baseline_p95_ms=10)
    assert result.should_stop and "p95" in result.reason


def test_qps_assessment_allows_healthy_batch():
    result = assess_qps_batch(.5, [200] * 5, [10, 12, 11, 9, 10])
    assert not result.should_stop and result.error_rate == 0


def test_probe_infers_candidates_and_keeps_limits_per_scale():
    inferred = infer_candidate_mapping({"data":[{"id":1,"lat":2,"lnt":3}]}, {"data":{"hotel":{"id":1,"title":"x","address":"y"}}})
    assert inferred["list_items_path"] == "data"
    assert inferred["detail_external_id_path"] == "data.hotel.id"
    profile = ProbeRequestProfile("data", "id", "lat", "lnt", "x", "y", "ox", "oy", "z", "id", "lng", "lat")
    plan = build_probe_plan(1, 2, [10, 11], profile, repeats=3)
    responses = [ApiResponse(200, body={"data":[{"id":str(n)} for n in range(26)]})] * 5 + [ApiResponse(200, body={"data":[{"id":str(n)} for n in range(6)]})] * 5
    found = analyze_probe_results(list(zip(plan, responses)), profile)
    assert found.candidate_item_limit_by_scale == {"10":26, "11":6}


def test_calibration_planners_cover_directions_and_scales():
    assert len(plan_viewport_boundary(1, 2, 10, (.1, .2))) == 8
    assert len(plan_zero_result_confirmation(1, 2, [10, 11], (.1,))) == 10


def test_seed_profile_validates_and_allows_scale_override():
    assert SeedSpec(1, 2, "dense", 10).resolved_scale(11) == 10
    assert SeedSpec(1, 2, "sparse").requires_empty_confirmation
    with pytest.raises(ValueError): SeedSpec(1, 2, "invalid").resolved_scale(10)
