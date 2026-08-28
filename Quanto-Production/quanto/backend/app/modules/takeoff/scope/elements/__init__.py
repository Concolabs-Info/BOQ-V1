from .beams import SCOPE_SPEC as BEAMS
from .ceiling import SCOPE_SPEC as CEILING
from .columns import SCOPE_SPEC as COLUMNS
from .doors_windows import SCOPE_SPEC as DOORS_WINDOWS
from .floor import SCOPE_SPEC as FLOOR
from .foundation import SCOPE_SPEC as FOUNDATION
from .roof import SCOPE_SPEC as ROOF
from .slab import SCOPE_SPEC as SLAB
from .stairs_ramps import SCOPE_SPEC as STAIRS_RAMPS
from .walls import SCOPE_SPEC as WALLS

ALL_SCOPE_SPECS = (
    COLUMNS,
    BEAMS,
    SLAB,
    FLOOR,
    CEILING,
    DOORS_WINDOWS,
    WALLS,
    ROOF,
    STAIRS_RAMPS,
    FOUNDATION,
)
