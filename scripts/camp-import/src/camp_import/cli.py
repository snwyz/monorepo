from __future__ import annotations
import argparse,sys
from pathlib import Path
from . import common,normalize,discover,fetch_detail,probe
from .common import LiveTransport,RateLimitedTransport,RetryingTransport,TokenBucket
from .field_mapping import ContractViolation,FieldMappingError,load_field_mapping
class LiveDisabledError(Exception):pass
def build_transport(live,qps_limit,burst):
    if not live:raise LiveDisabledError("真实 HTTP 请求被禁用；获得授权后显式传 --live 才会构造 LiveTransport。")
    return RetryingTransport(RateLimitedTransport(LiveTransport(),TokenBucket(qps_limit,burst)))
def parser():
    p=argparse.ArgumentParser(prog="camp-import");p.add_argument("--live",action="store_true");p.add_argument("--data-dir",default="data/55camp");sub=p.add_subparsers(dest="cmd",required=True)
    probe_parser=sub.add_parser("probe");probe_parser.add_argument("--province-code",required=True);probe_parser.add_argument("--center-lng",type=float,required=True);probe_parser.add_argument("--center-lat",type=float,required=True);probe_parser.add_argument("--scales",default="10,11,12");probe_parser.add_argument("--qps",type=float,default=.5);probe_parser.add_argument("--repeats",type=int,default=3)
    for option in ("items-path","external-id-path","lat-path","lng-path","list-lng-param","list-lat-param","list-old-lng-param","list-old-lat-param","list-scale-param","detail-id-param","detail-lng-param","detail-lat-param"): probe_parser.add_argument(f"--{option}",required=True)
    for name in ("discover","fetch-detail","normalize"):
        x=sub.add_parser(name);x.add_argument("--province-code",required=True)
        if name!="normalize":x.add_argument("--retry-failed",action="store_true")
        if name=="discover":x.add_argument("--seed-centers",required=True);x.add_argument("--min-tile-area-m2",type=float,default=250000);x.add_argument("--max-depth",type=int,default=8)
    return p
def main(argv=None):
    args=parser().parse_args(argv);province=Path(args.data_dir)/args.province_code
    try:
        if args.cmd == "probe":
            transport=build_transport(args.live,args.qps,1)
            profile=probe.ProbeRequestProfile(args.items_path,args.external_id_path,args.lat_path,args.lng_path,args.list_lng_param,args.list_lat_param,args.list_old_lng_param,args.list_old_lat_param,args.list_scale_param,args.detail_id_param,args.detail_lng_param,args.detail_lat_param)
            probe.run_probe(transport,probe.build_probe_plan(args.center_lng,args.center_lat,[int(x) for x in args.scales.split(",")],profile,repeats=args.repeats),profile,province/"probe")
            return 0
        mapping=load_field_mapping(province/"probe/field_mapping.yaml")
        if args.cmd=="normalize":normalize.run_normalize(province,mapping,args.province_code);return 0
        transport=build_transport(args.live,mapping.qps_limit,mapping.burst)
        if args.cmd=="discover":
            store=discover.TileStore(province/"processed/query_tiles.csv")
            if args.retry_failed:store.requeue_failed()
            engine=discover.DiscoverEngine(mapping,transport,store,province/"raw/camps.jsonl",args.min_tile_area_m2,args.max_depth)
            if not store.rows():engine.seed([(float(r["lng"]),float(r["lat"])) for r in common.read_csv_rows(Path(args.seed_centers))],args.province_code)
            engine.run();return 0
        store=fetch_detail.DetailStore(province/"processed/detail_tasks.csv")
        if args.retry_failed:store.requeue_failed()
        store.seed_tasks(common.read_csv_rows(province/"processed/camps_dedup.csv"));fetch_detail.DetailEngine(mapping,transport,store,province/"raw/details.jsonl").run();return 0
    except (LiveDisabledError,FieldMappingError) as exc:print(exc,file=sys.stderr);return 2
    except ContractViolation as exc:print(f"contract violation: {exc}",file=sys.stderr);return 1
if __name__=="__main__":raise SystemExit(main())
