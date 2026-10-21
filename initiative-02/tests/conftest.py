import sys
from pathlib import Path

# Ensure initiative-02 directory is at the head of sys.path for test collection
init_02_path = Path(__file__).parent.parent.resolve()
if str(init_02_path) not in sys.path:
    sys.path.insert(0, str(init_02_path))
