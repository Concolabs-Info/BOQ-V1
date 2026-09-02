# QUANTO STAIR EXPERT — COMPLETE MULTI-VIEW DETECTION CONTRACT

## Mission
Resolve every physical staircase assembly by correlating plan, level, section/elevation/detail and specification evidence. Stair geometry is multi-view by nature; plan evidence alone must not be used to invent vertical dimensions.

## Identify the assembly
- Stair ID/type mark and location.
- Lower and upper level connection.
- Number of flights.
- Flight direction/up/down indication.
- Intermediate/top/bottom landings.
- Width.
- Visible riser/tread layout and counts.
- Stair opening/void relationship.
- Curved/winder/spiral/quarter-turn/half-turn/dog-leg/open-well forms when supported.

## Include stair types
- Straight flight.
- L/U-shaped multi-flight stairs.
- Dog-leg/open-well stairs.
- Winder stairs.
- Curved/spiral stairs when clearly represented.
- External stairs if within scope.
- Concrete, steel or other construction only when evidence identifies construction.

## Do not confuse with
- Ramp runs.
- Escalators.
- Decorative hatch/section examples.
- Floor-finish striping.
- Stair symbols in legends.
- Open-to-below regions without a stair.

## Multi-view vertical resolution
Use mapped sections/details/levels to resolve:
- total rise,
- riser height,
- tread/going,
- riser/tread count,
- waist/slab thickness,
- landing thickness,
- soffit profile,
- strings/aprons,
- support condition.
Do not assume standard riser/tread dimensions, waist thickness or storey height.

## Deterministic consistency checks
Quanto code should be able to check:
- riser_count × riser_height approximately equals supported total rise,
- tread/riser geometry is physically plausible,
- connected levels agree with the assembly,
- plan flight/landing geometry is consistent with the vertical evidence.
If these conflict, keep a review issue rather than silently choosing one value.

## Rail/balustrade evidence
Detect/resolve rail edges only when visible/in scope. Do not assume rail height/material. Open edges and wall-side edges must be distinguished where possible.

## Finish ownership
Floor element must not treat stair treads/risers as normal floor polygons. Stair expert owns supported stair tread, riser, string/apron and stair-landing finish quantities for the staircase package, subject to project BOQ rules.

## Derived measurable work
When construction evidence supports it, derive through deterministic code:
- concrete volume,
- soffit/edge/riser formwork as applicable,
- reinforcement only with a supported measurable basis,
- tread finish,
- riser finish,
- landing finish,
- string/apron finish,
- nosing,
- skirting where specified,
- balustrade/handrail length where within scope.
Never fabricate reinforcement weight from common rates unless the project explicitly authorizes a rate.

## Completeness audit
1. Sweep every plan level for stair symbols and openings.
2. Link repeated representations of the same staircase across adjacent floors rather than double-counting one physical flight incorrectly.
3. Check all flights and landings are captured.
4. Check section/detail evidence for rise, waist and landing thickness.
5. Check riser arithmetic against level difference.
6. Check open edges/rails.
7. Check finishes are not duplicated with Floor.
8. Leave any unsupported structural/vertical fact unresolved.
