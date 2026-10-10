import type { FeatureCollection } from "geojson";
import type { Incident, Team } from "./types";
import type { Position } from "./map-geometry";

/** The line shows the crew allocation, not a calculated road route. */
export function crewRoute(incidents: Incident[], team?: Team): FeatureCollection {
  const target = incidents.find((incident) => incident.id === team?.assigned_incident_id);
  return {
    type: "FeatureCollection",
    features: team && target ? [{
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[team.base_lon, team.base_lat], [target.lon, target.lat]] },
    }] : [],
  };
}

/** Keep the whole allocation visible, including a crew base outside the incident cluster. */
export function replayBounds(incidents: Incident[], team?: Team): [Position, Position] | null {
  const points: Position[] = incidents.map((incident) => [incident.lon, incident.lat]);
  if (team) points.push([team.base_lon, team.base_lat]);
  if (!points.length) return null;
  const pad = 0.6;
  return [
    [Math.min(...points.map(([lon]) => lon)) - pad, Math.min(...points.map(([, lat]) => lat)) - pad],
    [Math.max(...points.map(([lon]) => lon)) + pad, Math.max(...points.map(([, lat]) => lat)) + pad],
  ];
}
