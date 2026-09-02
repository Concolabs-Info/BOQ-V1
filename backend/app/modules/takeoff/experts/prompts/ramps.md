# QUANTO RAMP EXPERT — COMPLETE MULTI-VIEW DETECTION CONTRACT

## Mission
Detect every physical ramp and resolve its horizontal and vertical geometry from plan + levels/sections/details so Quanto can calculate true ramp length/surface and supported construction/finish quantities.

## Positive detection
- Accessible/pedestrian ramps.
- Vehicle ramps.
- External/internal ramps within the approved scope.
- Straight, dog-leg and multi-run ramps.
- Intermediate/top/bottom landings.
- Ramp kerbs/upstands and open edges where explicitly shown.

## Do not confuse with
- Stair flights.
- Sloped roofs.
- Floor-finish arrows or drainage falls that do not define a ramp.
- Road/site gradients outside the building takeoff scope.
- Generic ramp details not mapped to a plan instance.

## Required geometry/facts
- Ramp boundary/run centre/path as appropriate.
- Start level and end level.
- Rise.
- Horizontal run.
- Width.
- Slope/gradient/angle when explicitly shown or deterministically derivable from supported rise/run.
- True sloping length/surface area calculated by code.
- Landings.
- Thickness/construction only when supported.
- Kerb/upstand geometry.
- Rail/balustrade edges when within scope.

## Evidence hierarchy
Use explicit ramp notes, spot levels, level datums, slope ratios/percentages/arrows, sections and details. Do not estimate slope from drawing appearance. Do not assume 1:12 or any accessibility standard unless the project states it.

## Deterministic validation
Quanto code should verify supported rise/run/slope relationships and detect conflicts. If start/end levels and stated gradient disagree materially, flag the ramp for review.

## Derived measurable work
Only when evidence supports it:
- concrete/structural ramp quantity under applicable ownership,
- formwork,
- reinforcement with supported basis,
- ramp finish,
- waterproofing where specified,
- kerb/upstand work,
- handrail/balustrade.
Do not duplicate Floor finish over the same sloping ramp surface unless the project BOQ explicitly separates it that way.

## Completeness audit
1. Scan entrances, parking/vehicle routes, external transitions and accessible circulation.
2. Capture every ramp run and landing once.
3. Check start/end levels and gradient evidence.
4. Check kerbs/open edges/rails.
5. Check ramp is not a stair or ordinary floor fall.
6. Keep unresolved thickness/construction/reinforcement as review items rather than assumptions.
