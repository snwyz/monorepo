import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// 独立检查真实画布如何使用两家 SDK，不请求网络、不读取生成产物。
async function setup(provider) {
  const layers = [];
  const maps = [];
  class Coordinate {
    constructor(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; }
    getLat() { return this.latitude; }
    getLng() { return this.longitude; }
  }
  class Pixel {
    constructor(x, y) { this.x = x; this.y = y; }
    getX() { return this.x; }
    getY() { return this.y; }
  }
  const project = (longitude, latitude) => new Pixel((longitude - 110) * 10000, (30 - latitude) * 10000);
  class SDKMap {
    constructor(container, options) { this.options = options; this.zoom = options.zoom; this.events = new Map(); maps.push(this); }
    on(name, handler) { this.events.set(name, handler); }
    off(name) { this.events.delete(name); }
    add() {}
    setStatus() {}
    setDoubleClickZoom() {}
    setDraggable() {}
    getZoom() { return this.zoom; }
    setZoom(zoom) { this.zoom = zoom; this.events.get(provider === "amap" ? "zoomend" : "idle")?.({}); }
    getCenter() { return new Coordinate(30, 110); }
    lngLatToContainer([longitude, latitude]) { return project(longitude, latitude); }
    projectToContainer(coordinate) { const pixel = project(coordinate.longitude, coordinate.latitude); pixel.x += this.shiftX ?? 0; return pixel; }
    destroy() { this.destroyed = true; }
  }
  class Overlay {
    constructor(options) { this.options = options; this.styles = options.styles; this.geometries = options.geometries; this.active = true; layers.push(this); }
    on() {}
    off() {}
    setMap(map) { this.active = map !== null; }
    setOptions(options) { Object.assign(this.options, options); }
    setGeometries(geometries) { this.geometries = geometries; }
    setStyles(styles) { this.styles = styles; }
  }
  class Style { constructor(options) { Object.assign(this, options); } }
  const sdk = { Map: SDKMap, Marker: Overlay, Polyline: Overlay, Pixel,
    LatLng: Coordinate, MarkerStyle: Style, PolylineStyle: Style, MultiMarker: Overlay, MultiPolyline: Overlay };
  const context = vm.createContext({
    console: { debug() {}, warn() {}, error() {} }, setTimeout, clearTimeout, URLSearchParams,
    window: { location: { hostname: "test.invalid", origin: "https://test.invalid" }, [provider === "amap" ? "AMap" : "TMap"]: sdk },
    document: { createElement: () => ({ style: {}, children: [], appendChild(child) { this.children.push(child); } }) },
    fetch: async () => ({ ok: true, json: async () => ({ status: "1", rectangle: "110,30;112,32" }) }),
  });
  const modules = new Map();
  function load(path) {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} };
    modules.set(path, module);
    const source = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInContext(`(function(require,module,exports){${source}\n})`, context)(
      (specifier) => load(resolve(dirname(path), `${specifier}.ts`)), module, module.exports,
    );
    return module.exports;
  }
  const exports = load(fileURLToPath(new URL(`../src/${provider === "amap" ? "amap-web" : "tencent-map-web"}.ts`, import.meta.url)));
  const Adapter = exports[provider === "amap" ? "AmapWebAdapter" : "TencentMapWebAdapter"];
  const adapter = await Adapter.create({ key: "test-key" });
  const canvas = adapter.createMap({ clientWidth: 1200, clientHeight: 720 }, { zoom: 15 });
  return {
    canvas, map: maps[0],
    labels: () => provider === "amap" ? layers.filter((layer) => layer.active && layer.options.zIndex === 79).map((layer) => layer.options)
      : layers.find((layer) => layer.options.zIndex === 79).geometries.map((geometry) => layers.find((layer) => layer.options.zIndex === 79).styles[geometry.styleId]),
    outline: () => layers.filter((layer) => layer.active && layer.options.zIndex === 40),
    core: () => layers.filter((layer) => layer.active && layer.options.zIndex === 65),
  };
}
const path = [{ longitude: 110.01, latitude: 29.99 }, { longitude: 110.05, latitude: 29.95 }];
const leg = { id: "outbound", path, roadSections: [{ name: "107省道", path }] };

for (const provider of ["amap", "tencent"]) {
  test(`${provider}: 实际画布以供应商正确的角度旋转路名，保持固定字号且不参与点击`, async () => {
    const fixture = await setup(provider);
    fixture.canvas.setRouteLegs([leg]);
    const labels = fixture.labels();
    assert.ok(labels.length > 0);
    if (provider === "amap") {
      assert.ok(Math.abs(labels[0].angle - 45) < 0.001);
      assert.equal(labels[0].anchor, "center");
      assert.equal(labels[0].clickable, false);
      assert.equal(labels[0].content.children[0].height, 16);
    } else {
      assert.ok(Math.abs(labels[0].rotate - 315) < 0.001);
      assert.equal(labels[0].height, 16);
      assert.equal(labels[0].anchor.y, 8);
    }
    fixture.canvas.destroy();
    assert.equal(fixture.map.destroyed, true);
    assert.equal(fixture.map.events.size, 0);
  });

  test(`${provider}: 缩小隐藏路名并恢复轻量线宽，放大复原且不累积图层`, async () => {
    const fixture = await setup(provider);
    fixture.canvas.setRouteLegs([leg]);
    const initialCount = fixture.labels().length;
    assert.ok(initialCount > 0);
    fixture.map.setZoom(12);
    assert.equal(fixture.labels().length, 0);
    const farOutline = fixture.outline()[0];
    assert.equal(provider === "amap" ? farOutline.options.strokeWeight : farOutline.styles.outline.width, 14);
    fixture.map.setZoom(15);
    assert.equal(fixture.labels().length, initialCount);
    const nearOutline = fixture.outline()[0];
    assert.equal(provider === "amap" ? nearOutline.options.strokeWeight : nearOutline.styles.outline.width, 23);
    fixture.canvas.destroy();
  });

  test(`${provider}: 重合返程路名使用蓝色，旧结果及失败路段不留有效标注`, async () => {
    const fixture = await setup(provider);
    fixture.canvas.setRouteLegs([leg, { ...leg, id: "return", isReturn: true }]);
    const labels = fixture.labels();
    assert.ok(labels.length > 0);
    const source = provider === "amap" ? labels[0].content.children[0].src : labels[0].src;
    assert.ok(decodeURIComponent(source).includes("#1297ff"));
    fixture.canvas.setRouteLegs([{ ...leg, stale: true }, { ...leg, id: "failed", failed: true }]);
    assert.equal(fixture.labels().length, 0);
    if (provider === "amap") assert.equal(fixture.core().length, 0);
    else assert.equal(fixture.core()[0].geometries.length, 0);
    fixture.canvas.destroy();
  });
}

test("tencent: 平移结束不依赖瓦片空闲事件，及时剔除屏幕外路名", async () => {
  const fixture = await setup("tencent");
  fixture.canvas.setRouteLegs([leg]);
  const count = fixture.labels().length;
  assert.ok(count > 0);
  fixture.map.shiftX = 1400;
  fixture.map.events.get("panend")?.({});
  assert.equal(fixture.labels().length, 0);
  fixture.map.shiftX = 0;
  fixture.map.events.get("resize")?.({});
  assert.equal(fixture.labels().length, count);
  fixture.canvas.destroy();
});
