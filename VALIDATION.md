# RIFTBANNER 1.2.0

Implemented in `index (5).html`, the sole canonical game build. The 9,007,677-byte file embeds Babylon.js 9.29.0, original geometry, generated textures, skeletal pose data, and synthesized audio. No build step, API key, or runtime asset CDN is required. This upgrade replaces the canonical game file on the repository's main branch.

Final HTML SHA-256: `2825fd02e4f47bb5b359bdff57d7d8a2f08bdfc09dffec36f0c59a445e9cf47b`.

- Four distinct original heroes and important officers use weighted meshes, a shared 20-bone armature, authored pose blending, weapon sockets, two-handed IK, and cloth/hair motion. Armor, faces, hands, coats, and weapons are reshaped. Crowds retain economical joint batching and distant volumetric silhouettes; the 520-slot capacity is preserved.
- Kareth/Seyra/Nivara/Torvek have 4/5/6/4 light steps and 5/6/7/5 heavy routes: 19 light steps and 23 charge branches. Launchers, posture control, sweeps, and finishers have distinct timing and geometry. Physical reach follows measured weapon-tip curves. Buffering, cancel windows, airborne limits, generation-safe hits, boss resistance, knockdown recovery, capped hit-stop, and contact trails are explicit.
- All three maps gain selective PBR materials, local surface detail, environment lighting, atmospheric skies, bounded shadows, torch lights, architecture, banners, vegetation, and landmarks. Camera clearance and brief ultimate framing preserve orientation.
- Officer-led formations advance, flank, retreat, and regroup. Morale and base ownership affect finite reinforcements. Waves spawn away from the hero; escort corners and gates remain functional. Campaign structures, training, unlocks, and progression are retained.
- Arabic RTL HUD, contextual combo help, 30/60 Hz targets, layered sound, and bounded audio resources are improved. Original keyboard/controller mappings and schema-one progress are preserved.

The complete 57-check suite passed with zero runtime errors, console errors, or remote requests. It covers hero chains/routes, skills/ultimates, wall blocking, friendly safety, recycling/LOD identity, airborne reactions, boss resistance, formations/supply, physical escort paths, all campaign objective sequences and victory/defeat, restarts, audio limits, saves, and storage failure. These are controlled fixtures and accelerated objective tests, not complete player-driven campaigns.

That suite tested HTML `7eddff60…`. The final adjustment changed only two CSS properties for phone allied-health text; authored JavaScript remains byte-identical, verified in `static-checks.json`. On the exact delivered HTML, seven input/rotation checks, three later-route combat checks, and three lifecycle checks pass. Seyra C6 and Nivara C6/C7 complete actual active windows, with one hostile damage event per authored pulse and no friendly damage. WebGL loss/restoration uses the browser extension; fullscreen entry/exit uses the browser API. Visibility and controller inputs use fixtures.

Phone 915×412 at control scales 1 and 1.2, tablet 1480×924, and DeX 1920×1080 pass HUD separation and touch bounds, with targets at least 48px. Twenty-two browser images include four character selections, close gameplay, dense battle, night lighting, C2/C4 poses for every hero, and the formerly cramped night-camera corner. PNG checksums are recorded. Engine scripts, Apache notice, and default control blocks match the original; syntax and whitespace checks pass.

Measurements use Linux Chromium 151, WebGL2 through ANGLE SwiftShader software rendering, balanced graphics, automatic adaptation off, and a 1280×720 buffer. There are 30 baseline and 20 final retained samples after warmup. Values are median / nearest-rank p95 from raw samples.

| Metric | Baseline | Final |
| --- | ---: | ---: |
| Simulation per rendered frame (ms) | 6.30 / 88.20 | 4.10 / 9.40 |
| Character animation (ms) | 4.90 / 47.80 | 2.65 / 5.10 |
| Character update and upload (ms) | 4.90 / 47.80 | 2.75 / 7.10 |
| Scene render wall time (ms) | 13.25 / 46.30 | 27.15 / 65.10 |
| Draw calls | 142.0 / 145 | 114.5 / 121 |
| Rendered triangles | 199,446.0 / 199,612 | 207,598.0 / 207,742 |
| Software presentation interval (ms) | 800.10 / 986.20 | 1,206.60 / 1,504.20 |
| Reported JS heap (MiB) | 47.41 / 48.82 | 66.48 / 95.94 |

Simulation has a median of four fixed steps per rendered frame. Final instance uploads are 90,880 bytes/frame (88.75 KiB); estimated uncompressed texture storage is 6.03 MiB. Reported heap is approximate and affected by garbage collection; actual GPU allocation is unmeasured. Software presentation stalls reached 3,794.4 ms and scene wall time reached 2,708.1 ms. Fewer draws and lower simulation/animation costs coexist with higher rendering and memory costs. These measurements establish neither stable hardware frame rates nor a Samsung 60 FPS claim.

The evidence ZIP contains JSON results, screenshots, comparison images, and the Playwright harness. Serve the repository on port 8767 and open `http://127.0.0.1:8767/index%20%285%29.html?debug`. `RiftDebug.start(stage, mode, hero)`, `setManual(true)`, `step(count)`, and `inspect()` support reproduction. Recorded harness paths refer to this workspace and may need adjustment elsewhere. The playable ZIP contains this exact HTML and report.

Remaining limits: stylized procedural art and authored pose blending, rigid batched crowd animation, approximate secondary motion, and synthesized Foley. Commercial console art parity is not claimed. Physical Galaxy S24 Ultra/Tab S11 Ultra, DualSense connection/vibration, audible mix quality, and physical-device lifecycle/performance remain untested. Chromium administration policy blocked direct local-file opening (`ERR_BLOCKED_BY_ADMINISTRATOR`); static HTTP loading works without remote assets. Use a browser permitting local WebGL files or ordinary static HTTPS hosting.
