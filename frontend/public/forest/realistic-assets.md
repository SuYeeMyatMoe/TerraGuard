# Natural forest assets

Generated with the built-in image_gen tool for TerraGuard's interactive 3D forest. These are generated photographic-style textures, not photographs captured in a real forest.

## Saved assets

- `frontend/public/forest/natural-pine-v1.png`: transparent complete-tree texture, used on crossed canopy planes for natural bark, branches and crown outlines.
- `frontend/public/forest/pine-needles-v1.png`: transparent pine-bough texture retained from the foliage experiment.
- `frontend/public/forest/woodland-floor-v1.png`: opaque woodland-floor texture, tiled in world coordinates.

The scene uses photographic tree impostors on instanced crossed planes, alpha cutouts, light green foliage colors and varied tree heights. Branch shading is baked into the cutout; foliage avoids per-pixel dynamic lighting and shadow sampling. Background trees are spatially batched for camera culling. These are lightweight texture-based trees, not scanned 3D tree models. The textures do not change simulation states, crew assignment or suppression timing.

## Final pine texture prompt

Use case: photorealistic-natural. Asset type: alpha-cutout foliage texture for a real-time 3D evergreen tree. Generate a single lush real Scots pine branch spray, photographed as a botanical specimen on a genuinely transparent background. Composition: broad horizontal fan of dense fine individual green pine needles, a thin subtle brown central woody branch running from the exact left center toward the right, many overlapping needle-bearing twigs fanning upward and downward; overall irregular elongated oval silhouette, width about twice its height, comfortably within frame with clear transparent margins on ALL sides. Needles range from deep forest green in interiors to muted sage and olive green tips. Crisp tiny needle silhouettes and visible natural gaps between twig clusters. Neutral soft daylight with very subtle self shading; no external cast shadow. View from slightly above the branch, nearly orthographic. Photographic and botanical realism, physically natural colors, no neon green, no cartoon, no polygon shapes, no painted texture, no stylized illustration, no pot, no trunk, no entire tree, no ground, no text, no border, no checkerboard background. One branch only, large enough and dense enough to form the canopy of a tree when repeated in 3D. Actual transparent alpha.

## Final whole-tree texture prompt

Use case: photorealistic-natural. Asset type: transparent complete pine tree cutout for a 3D forest simulation, photographic tree impostor texture. Subject: ONE real mature Scots pine tree, about 12 metres tall, growing naturally, dense irregular full crown of rich forest green foliage with many individually visible fine needle branches, irregular organic outline, layered branching but NOT perfectly regular tiers, a short visible thick textured brown trunk beneath the crown. Photograph viewed from slightly above, camera elevation about 20 degrees, near orthographic telephoto, entire tree centered with the very highest tip and lowest trunk foot in frame and generous clear margins on every edge. Natural neutral daylight, soft self shadows within dense crown and muted sunlit green outer bough tips; avoid gray or blue foliage, avoid neon or yellow-green. All tree details tack sharp. This must look like a high quality real tree photograph, not a CGI model, not a painting, not a game asset illustration, not a cartoon. Genuinely transparent background, no soil, no scenery, no ground shadow, no pot, no text, no checkerboard. One single whole tree filling most of the vertical frame, tree about twice as tall as it is wide. Fine natural realistic silhouette, no surrounding objects.

## Final ground texture prompt

Use case: photorealistic-natural. Asset type: seamless albedo texture of woodland floor for a 3D landscape. Primary request: square 1024 x 1024 overhead close photograph of a natural forest floor covered with dense dark olive moss, tiny blades of grass, dried brown pine needles and small flecks of earth. Orthographic straight downward camera, all surfaces in sharp focus. Uniform soft neutral overcast daylight, no baked shadows or highlights. Texture must tile seamlessly on all four edges with no obvious big patterns or unique focal point, no objects taller than grass, no trees, no trunks, no stones bigger than a few centimeters. Restrained natural brown and olive palette, photographic detail, no illustration, no neon or saturated green, no text, no borders. Solid opaque image covering the entire canvas.
