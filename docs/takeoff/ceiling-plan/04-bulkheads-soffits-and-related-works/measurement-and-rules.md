# Bulkheads, Soffits and Related Works — Measurement and Rules

## 1. Bulkhead underside

Measure from the accepted underside polygon/face.

## 2. Bulkhead vertical face

If a straight bulkhead edge has:

- accepted edge length `L`;
- accepted drop/face height `H`;

then code can create the vertical face and calculate its area.

For changing heights or complex shapes, construct the real 3D face rather than using a single average height.

## 3. End faces

Create only when they physically exist and are within finish scope.

## 4. External soffits

Measure the actual underside surface.

If flat, plan polygon can be used after alignment.
If sloped, use special-ceiling surface geometry.

## 5. Perimeter items

Use a canonical `CeilingBoundaryEdge` model.

Each edge can carry flags such as:

- wall junction;
- open edge;
- bulkhead junction;
- external edge;
- trim applicable;
- cornice applicable;
- excluded;
- source/evidence.

This is safer than storing one pre-calculated room perimeter.

## 6. Openings and deductions

Store geometry of meaningful openings where available.

The measurement rule service decides deduction based on the configured measurement standard/project rule.

Do not remove every light/diffuser automatically.

## 7. Measurement descriptions

Keep geometry and description separate.

Example:

```text
Bulkhead face geometry = 12.4 m²
Finish definition = painted gypsum board
Measurement rule = wall/ceiling-related face treatment
BOQ description = generated later
```

This allows the same geometry to support different measurement/description rules.
