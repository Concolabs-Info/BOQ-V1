# Special Ceilings — Geometry and Measurement

All official measurements are deterministic.

## 1. Flat ceiling

For an accepted flat polygon:

```text
surface area = polygon plan area
```

Use the confirmed world-coordinate geometry.

## 2. Single-slope/raked ceiling

If the ceiling slopes in one direction and code knows:

- horizontal run across the slope;
- rise between low and high level;
- length perpendicular to slope;

calculate the sloping width from the geometric relationship and multiply by the true length/shape.

For irregular polygons, construct a 3D plane from the accepted slope data and calculate the 3D polygon surface area.

Do not approximate every sloped room as a rectangle.

## 3. Slope angle given

If an explicit angle/pitch is given, create the 3D plane using the angle and direction, then calculate the true polygon surface area.

Keep the raw angle text/evidence.

## 4. Vaulted/multi-plane ceiling

Calculate each plane separately and sum the validated planes.

Check that planes meet correctly at ridge/valley/shared edges.

Do not double-count shared boundaries.

## 5. Stepped/dropped ceiling

Measure:

- each horizontal underside zone;
- each vertical transition face when it belongs to the measured finish scope.

Keep horizontal and vertical surfaces separately in the quantity ledger so BOQ rules can group them correctly.

## 6. Ceiling island

Measure the island underside by its accepted polygon.

If island sides are finished and dimensioned, measure them as separate faces.

Whether the base ceiling behind/above the island remains measurable depends on the actual construction and configured measurement rules.

## 7. Double-height ceiling

Plan area may still equal the room footprint for a flat high-level ceiling, but the 3D elevation must be the actual high ceiling level.

The quantity belongs once, not once per intermediate storey.

## 8. Stair soffit

Possible measurement surfaces:

- sloped underside of flight;
- stepped underside;
- flat underside of landing;
- vertical faces around opening/bulkhead where applicable.

Use accepted stair/section geometry. Do not infer from stair plan footprint alone.

## 9. Curved ceiling

Build a real surface from radius/profile data, then calculate the surface area numerically/analytically in code.

If geometry is incomplete, keep the candidate unmeasured and ask for user input.

## 10. Deductions/openings

Do not hard-code one deduction threshold into geometry extraction.

Store ceiling openings/penetrations if required, then let the configured measurement-rule service decide whether an opening is deducted according to the chosen standard/project rules.

This is important for:

- access panels;
- large skylights;
- ceiling void openings;
- large service openings;
- columns/shafts intersecting the ceiling.

## 11. Quantity provenance

Every measured special ceiling quantity should keep:

- source CeilingZone revision;
- special geometry revision;
- scale/transform version;
- measurement-rule version;
- calculation inputs;
- final value;
- user confirmation status.
