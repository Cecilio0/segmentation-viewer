import pytest

from girder.plugin import loadedPlugins


@pytest.mark.plugin('segmentation_visualization')
def test_import(server):
    assert 'segmentation_visualization' in loadedPlugins()
