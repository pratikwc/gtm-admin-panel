import 'server-only';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-50m.json';
import worldLow from 'world-atlas/countries-110m.json';

/** Market names as the panel uses them (lib/buckets COUNTRY_RULES) = Natural Earth country names. */
export const MAP_MARKETS = [
  'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman',
  'India', 'Singapore', 'Hong Kong', 'Philippines',
] as const;

export interface MapShape {
  name: string;
  d: string;
  cx: number;
  cy: number;
  /** Too small to hover on its own at this zoom (Bahrain, Singapore, Hong Kong): drawn with a dot too. */
  small: boolean;
}
export interface MarketMapGeometry {
  width: number;
  height: number;
  base: string; // every other country in view, one path, for context
  shapes: MapShape[];
}

const WIDTH = 960;
const HEIGHT = 440;
let memo: MarketMapGeometry | null = null;

/** SVG paths for our markets and their neighbours, framed on the markets. Computed once per server. */
export function marketMapGeometry(): MarketMapGeometry {
  if (memo) return memo;
  type T = Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const load = (t: T) => (feature(t, t.objects.countries) as FeatureCollection<Geometry, { name: string }>).features;
  const all = load(world as unknown as T);
  // Neighbours are only context, so they come from the lighter 110m set.
  const context = load(worldLow as unknown as T);
  const wanted = new Set<string>(MAP_MARKETS);
  const markets = all.filter(f => wanted.has(f.properties.name));

  const projection = geoMercator()
    .fitExtent([[24, 24], [WIDTH - 24, HEIGHT - 24]], { type: 'FeatureCollection', features: markets } as FeatureCollection)
    .clipExtent([[0, 0], [WIDTH, HEIGHT]]);
  const path = geoPath(projection).digits(1);
  const coarse = geoPath(projection).digits(0);

  const base = context
    .filter(f => !wanted.has(f.properties.name))
    .map(f => coarse(f as Feature) ?? '')
    .filter(Boolean)
    .join('');

  const shapes = markets.map(f => {
    const [cx, cy] = path.centroid(f as Feature);
    return { name: f.properties.name, d: path(f as Feature) ?? '', cx: Math.round(cx), cy: Math.round(cy), small: path.area(f as Feature) < 40 };
  });

  memo = { width: WIDTH, height: HEIGHT, base, shapes };
  return memo;
}
