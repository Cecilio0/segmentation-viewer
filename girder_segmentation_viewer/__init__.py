from girder import plugin


class SegmentationViewerPlugin(plugin.GirderPlugin):
    DISPLAY_NAME = 'Segmentation Viewer'
    CLIENT_SOURCE_PATH = './web_client'

    def load(self, info):
        print('loaded segmentation viewer')
        # add plugin loading logic here
        pass
