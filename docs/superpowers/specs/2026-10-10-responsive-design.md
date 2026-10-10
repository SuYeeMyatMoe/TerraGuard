# Responsive TerraGuard

The user requested analysis followed by implementation, retaining the existing design and functionality, and explicitly requested no subagents.

At 390 × 844 the command header needs 735 px and clips its actions. The imagery panel and incident column occupy the same map space. Camera padding reserves 720 px horizontally even on a phone. Drawers, timeline and the field brief also assume desktop widths.

Use a single column below 1024 px: a bounded map/3D viewport, followed by playback and conditions when relevant, then incident intelligence and decisions. Keep desktop overlay placement above that breakpoint. The imagery panel collapses on compact screens while its state and map stay mounted. Wrap the command header, constrain all overlays, respect dynamic viewport and safe areas, and increase touch targets. Fit map cameras using their actual container dimensions; resize keeps the current view. Scale 3D framing for narrow canvases. Retain existing imagery ordering, caching and comparison behavior.

The landing page keeps the forest narrative and palette, with readable text, usable buttons and short-height layouts. Validate 320, 390, 768, 1024 and 1440 px widths, portrait and landscape, the incident-to-decision flow, imagery controls, comparison, drawers, 3D playback and reduced motion. No backend/storage/API changes or credential copying.
