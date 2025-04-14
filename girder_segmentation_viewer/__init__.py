import os.path
import tempfile
import shutil

from girder.constants import TokenScope, AccessType
from girder.models.file import File
from girder.models.item import Item
from girder.plugin import GirderPlugin
from girder import events
from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.api.rest import Resource
from girder.exceptions import RestException
import SimpleITK as sitk

class SegmentationViewerPlugin(GirderPlugin):
    DISPLAY_NAME = 'Segmentation Viewer'
    CLIENT_SOURCE_PATH = 'web_client'

    def load(self, info):
        Item().exposeFields(level=AccessType.READ, fields={'images'})
        # events.bind('data.process', 'dicom_viewer', _uploadHandler)
        info['apiRoot'].item.route(
            'POST',
            (':id', 'detect_images'),
            SegmentationItem().detect_images
        )


class SegmentationItem(Resource):

    @access.user(scope=TokenScope.DATA_WRITE)
    @autoDescribeRoute(
        Description('Get and store which files within an item are images readable by itk')
        .modelParam(
            'id',
            'Item ID',
            model='item',
            level=AccessType.WRITE,
            paramType='path'
        )
        .errorResponse('ID was invalid')
        .errorResponse('Read permission denied on the item', 403)
    )
    def detect_images(self, item) -> None:
        """
        Try to get all files within an item that can be read by itk,
        if any store references to them in a new 'images' property
        """

        image_files = []

        for file in Item().childFiles(item):
            # Check if any files are readable by itk
            if not _is_readable_by_sitk(file):
                continue
            # Add a reference for each file that is
            image_files.append({
                'name': file['name'],
                '_id': file['_id']
            })

        if image_files:
            # Save files that were readable to a new Item property
            item['images'] = image_files
            # Save the item
            Item().save(item)

def _is_readable_by_sitk(file) -> bool:
    """
    Check if a girder file is readable by SimpleITK or not
    :param file:
    :return: whether the file is readable by SimpleITK or not
    """

    # Get original file extension
    _, ext = os.path.splitext(file['name'])
    try:
        # Create a temporary file with the same extension as the original
        with tempfile.NamedTemporaryFile(suffix=ext, delete=True) as tmp:
            # Download file from Girder into temp file
            with File().open(file) as fp:
                shutil.copyfileobj(fp, tmp)
                tmp.flush()  # Ensure all data is written

            reader = sitk.ImageFileReader()
            reader.SetFileName(tmp.name)
            reader.ReadImageInformation()
            return True

    except RuntimeError:
        return False
