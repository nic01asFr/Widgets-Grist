/**
 * MapLibre GL JS — sources GeoJSON, layers, paint StyleDeclarative → MapLibre spec.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Q2GMap = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Fond de carte : le meme style vectoriel que le composant Atlas (lib/fonds-base.js, STYLE_BASE_URL), sans cle.
  // L'ancien fond raster Carto affichait « API KEY REQUIRED ». L'attribution vient du style lui-meme.
  const BASEMAP = 'https://tiles.openfreemap.org/styles/liberty';

  function sourceId(tableName) {
    return 'src-' + String(tableName).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function layerPrefix(tableName) {
    return 'lyr-' + String(tableName).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /** Convertit une ligne Grist en Feature GeoJSON WGS84. */
  function parseCoord(row, keys) {
    for (let i = 0; i < keys.length; i++) {
      const v = parseFloat(row[keys[i]]);
      if (Number.isFinite(v)) return v;
    }
    return NaN;
  }

  function rowToFeature(row, layer, fillColor, visible) {
    let geometry = null;
    // geometry_json prioritaire (polygones QGIS même si cfg widget dit Point)
    if (row.geometry_json) {
      try {
        geometry = typeof row.geometry_json === 'string'
          ? JSON.parse(row.geometry_json)
          : row.geometry_json;
      } catch (e) {
        geometry = null;
      }
    }
    if (!geometry && layer.geomType === 'Point') {
      const lat = parseCoord(row, ['latitude', 'Latitude', 'lat', 'centroid_lat']);
      const lon = parseCoord(row, ['longitude', 'Longitude', 'lon', 'lng', 'centroid_lon']);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      geometry = { type: 'Point', coordinates: [lon, lat] };
    } else if (!geometry) {
      return null;
    }
    geometry = flattenCoords2D(geometry);

    const props = {
      _row_id: row.id,
      _fill_color: fillColor || '#808080',
      _visible: visible === false ? 0 : 1,
      _fill_opacity: row._fill_opacity != null ? row._fill_opacity : 0.55,
      _line_opacity: row._line_opacity != null ? row._line_opacity : 0.85,
    };
    for (const f of (layer.fields || [])) {
      if (['geometry_json', 'centroid_lat', 'centroid_lon', 'latitude', 'longitude'].includes(f.name)) continue;
      const v = row[f.name];
      if (v != null && v !== '') props[f.name] = v;
    }
    return { type: 'Feature', geometry, properties: props };
  }

  function rowsToGeoJSON(rows, layer, colorFn) {
    const features = [];
    for (const row of rows) {
      const color = colorFn ? colorFn(row) : (row.fill_color || layer._color || '#808080');
      const visible = row._map_visible !== false;
      const f = rowToFeature(row, layer, color, visible);
      if (f) features.push(f);
    }
    return { type: 'FeatureCollection', features };
  }

  /** Expression MapLibre : couleur depuis propriété _fill_color. */
  function colorExpr(fallback) {
    return ['coalesce', ['get', '_fill_color'], fallback || '#808080'];
  }

  function visibilityFilter() {
    return ['==', ['get', '_visible'], 1];
  }

  /** MapLibre GeoJSON : conserver lon/lat uniquement (QGIS exporte souvent Z/M). */
  function flattenCoords2D(geom) {
    if (!geom?.coordinates) return geom;
    function walk(c) {
      if (typeof c[0] === 'number') return [c[0], c[1]];
      return c.map(walk);
    }
    return { type: geom.type, coordinates: walk(geom.coordinates) };
  }

  /** Paint fill/circle/line depuis StyleDeclarative (fallback property-driven). */
  function paintForGeometry(geomType, declarative, fallbackColor) {
    const fb = fallbackColor || '#808080';
    const baseOpacity = declarative?.opacity ?? 0.55;

    if (geomType === 'Point') {
      return {
        'circle-color': colorExpr(fb),
        'circle-radius': 6,
        'circle-stroke-color': 'rgba(0,0,0,0.35)',
        'circle-stroke-width': 1,
        'circle-opacity': ['coalesce', ['get', '_line_opacity'], 0.9],
      };
    }
    if (geomType === 'Line') {
      return {
        'line-color': colorExpr(fb),
        'line-width': 2,
        'line-opacity': ['coalesce', ['get', '_line_opacity'], 0.85],
      };
    }
    return {
      'fill-color': colorExpr(fb),
      'fill-opacity': ['coalesce', ['get', '_fill_opacity'], baseOpacity],
      'fill-outline-color': '#333333',
    };
  }

  function layoutZoom(lod) {
    const out = {};
    const minZ = lod?.visibility?.minZoom;
    const maxZ = lod?.visibility?.maxZoom;
    if (minZ != null && Number.isFinite(minZ)) out.minzoom = minZ;
    if (maxZ != null && Number.isFinite(maxZ)) out.maxzoom = maxZ;
    return out;
  }

  /** Ajoute source + layers MapLibre pour une couche Grist. */
  function addGristLayer(map, tableName, layer, declarative, defaultColor, geojson, lod) {
    const sid = sourceId(tableName);
    const prefix = layerPrefix(tableName);
    const decl = declarative || { kind: 'single', color: defaultColor };
    const visFilter = visibilityFilter();
    const zoomLayout = layoutZoom(lod || layer._lod);

    if (map.getSource(sid)) {
      map.getSource(sid).setData(geojson || { type: 'FeatureCollection', features: [] });
      return { sourceId: sid, layerIds: listLayerIds(map, prefix) };
    }

    map.addSource(sid, { type: 'geojson', data: geojson || { type: 'FeatureCollection', features: [] } });

    const layerIds = [];
    const gtype = layer.geomType || 'Polygon';

    if (gtype === 'Point') {
      const id = prefix + '-circle';
      map.addLayer({
        id,
        type: 'circle',
        source: sid,
        filter: visFilter,
        layout: zoomLayout,
        paint: paintForGeometry('Point', decl, defaultColor),
      });
      layerIds.push(id);
    } else if (gtype === 'Line') {
      const id = prefix + '-line';
      map.addLayer({
        id,
        type: 'line',
        source: sid,
        filter: visFilter,
        layout: zoomLayout,
        paint: paintForGeometry('Line', decl, defaultColor),
      });
      layerIds.push(id);
    } else {
      const fillId = prefix + '-fill';
      const lineId = prefix + '-outline';
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: sid,
        filter: visFilter,
        layout: zoomLayout,
        paint: paintForGeometry('Polygon', decl, defaultColor),
      });
      map.addLayer({
        id: lineId,
        type: 'line',
        source: sid,
        filter: visFilter,
        layout: zoomLayout,
        paint: {
          'line-color': '#333333',
          'line-width': 1,
          'line-opacity': 0.45,
        },
      });
      layerIds.push(fillId, lineId);
    }

    return { sourceId: sid, layerIds };
  }

  function listLayerIds(map, prefix) {
    return (map.getStyle()?.layers || [])
      .map(l => l.id)
      .filter(id => id.startsWith(prefix + '-'));
  }

  function updateSourceData(map, tableName, geojson) {
    const sid = sourceId(tableName);
    const src = map.getSource(sid);
    if (src) src.setData(geojson);
  }

  function setLayerVisibility(map, tableName, visible) {
    const prefix = layerPrefix(tableName);
    for (const lid of listLayerIds(map, prefix)) {
      map.setLayoutProperty(lid, 'visibility', visible ? 'visible' : 'none');
    }
  }

  /** Bounds [[west,south,east,north]] depuis FeatureCollection. */
  function boundsFromGeoJSON(geojson) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function walkCoords(c) {
      if (typeof c[0] === 'number') {
        minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
        minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
        return;
      }
      for (const p of c) walkCoords(p);
    }
    for (const f of (geojson?.features || [])) {
      if (f.geometry?.coordinates) walkCoords(f.geometry.coordinates);
    }
    if (!Number.isFinite(minX)) return null;
    return [[minX, minY], [maxX, maxY]];
  }

  function fitMapToBounds(map, geojsonOrList, padding) {
    const pad = padding ?? 40;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const items = Array.isArray(geojsonOrList) ? geojsonOrList : [geojsonOrList];
    for (const gj of items) {
      const b = boundsFromGeoJSON(gj);
      if (!b) continue;
      minX = Math.min(minX, b[0][0]); minY = Math.min(minY, b[0][1]);
      maxX = Math.max(maxX, b[1][0]); maxY = Math.max(maxY, b[1][1]);
    }
    if (!Number.isFinite(minX)) {
      map.setCenter([2.5, 46.5]);
      map.setZoom(5);
      return;
    }
    map.fitBounds([[minX, minY], [maxX, maxY]], { padding: pad, maxZoom: 15 });
  }

  function destroyMap(map) {
    if (map) map.remove();
  }

  function initMap(containerId) {
    const map = new maplibregl.Map({
      container: containerId,
      style: BASEMAP,
      center: [2.5, 46.5],
      zoom: 5,
      attributionControl: true,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    return map;
  }

  /** Attache popup clic sur les layers d'une couche Grist. */
  function bindPopup(map, tableName, layer, buildPopupHtml) {
    const prefix = layerPrefix(tableName);
    const ids = listLayerIds(map, prefix);
    if (!ids.length) return;

    map.on('click', ids, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const row = { id: f.properties._row_id };
      for (const field of (layer.fields || [])) {
        if (f.properties[field.name] !== undefined) row[field.name] = f.properties[field.name];
      }
      new maplibregl.Popup({ maxWidth: '280px' })
        .setLngLat(e.lngLat)
        .setHTML(buildPopupHtml(row, layer.fields))
        .addTo(map);
    });

    map.on('mouseenter', ids, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', ids, () => { map.getCanvas().style.cursor = ''; });
  }

  return {
    BASEMAP,
    sourceId,
    layerPrefix,
    rowToFeature,
    rowsToGeoJSON,
    flattenCoords2D,
    paintForGeometry,
    addGristLayer,
    updateSourceData,
    setLayerVisibility,
    boundsFromGeoJSON,
    fitMapToBounds,
    initMap,
    destroyMap,
    bindPopup,
  };
});
