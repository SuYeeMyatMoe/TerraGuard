from app.tile_sign import decode_map_url, decode_recipe, sign_map_url, sign_recipe, valid_map_url

URL = "https://earthengine.googleapis.com/v1/projects/p/maps/m/tiles/{z}/{x}/{y}"


def test_map_url_roundtrip_and_expiry():
    handle = sign_map_url(URL, 100, "abcd")
    assert decode_map_url(handle, 99) == URL
    try:
        decode_map_url(handle, 100)
        assert False, "expired handle must not resolve"
    except KeyError:
        pass


def test_recipe_handle_is_deterministic():
    descriptor = {"recipe": {"project": "p", "version": "v1", "start": "a", "end": "b", "revision": "", "snapshot": "historical"}, "layer": "rgb"}
    assert sign_recipe(descriptor) == sign_recipe(descriptor)
    assert decode_recipe(sign_recipe(descriptor)) == descriptor


def test_forged_or_invalid_handles_are_rejected():
    handle = sign_map_url(URL, 100, "n")
    try:
        decode_map_url(handle[:-1] + ("0" if handle[-1] != "0" else "1"), 1)
        assert False
    except KeyError:
        pass
    assert not valid_map_url("https://earthengine.googleapis.com/v1/projects/p/maps/m/tiles/{z}/{x}/{y}?x=1")
