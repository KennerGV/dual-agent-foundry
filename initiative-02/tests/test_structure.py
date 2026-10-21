def test_packages_importable():
    import sys
    from pathlib import Path

    init_02_path = Path(__file__).parent.parent
    sys.path.insert(0, str(init_02_path))

    import detectors
    import rules
    import api

    assert detectors is not None
    assert rules is not None
    assert api is not None
