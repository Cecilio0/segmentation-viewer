import pytest

from girder.plugin import loadedPlugins


@pytest.mark.plugin('girder_segmentation_viewer')
def test_import(server):
    assert 'girder_segmentation_viewer' in loadedPlugins()
