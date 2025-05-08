import tempfile
import shutil

from girder.constants import TokenScope, AccessType
from girder.exceptions import GirderException
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.api.v1.item import Item as ItemClass
from girder.plugin import GirderPlugin
from girder import events
from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.api.rest import Resource, filtermodel
import SimpleITK as sitk

class SegmentationViewerPlugin(GirderPlugin):
    DISPLAY_NAME = 'Segmentation Viewer'
    CLIENT_SOURCE_PATH = 'web_client'

    def load(self, info):
        Item().exposeFields(level=AccessType.READ, fields={'segmentation'})
        events.bind('data.process', 'segmentation_viewer', _upload_handler)
        events.bind('model.file.remove', 'segmentation_viewer', _deletion_handler)
        info['apiRoot'].item.route(
            'POST',
            (':id', 'detect_images'),
            SegmentationItem().detect_images
        )
        info['apiRoot'].item.route(
            'POST',
            (':id', 'set_base_image'),
            SegmentationItem().set_base_image
        )
        info['apiRoot'].segmentation = SegmentationItem()


class SegmentationItem(Resource):
    def __init__(self):
        super().__init__()
        self.resourceName = 'segmentation'
        self.item_class = Item()

        self.route(
            'POST',
            (),
            self.create_segmentation_item
        )

    @access.user(scope=TokenScope.DATA_WRITE)
    @filtermodel(model=Item)
    @autoDescribeRoute(
        Description('Create a new segmentation item ')
        .responseClass('Item')
        .modelParam('folderId', 'The ID of the parent folder.', model=Folder,
                    level=AccessType.WRITE, paramType='query')
        .param('name', 'Name for the item.', strip=True)
        .param('base_image_id', 'Base image file ID')
        .param('description', 'Description for the item.', required=False,
               default='', strip=True)
        .param('reuse_existing', 'Return existing item (by name) if it exists.',
               required=False, dataType='boolean', default=False)
        .jsonParam('metadata', 'A JSON object containing the metadata keys to add',
                   paramType='form', requireObject=True, required=False)
        .errorResponse()
        .errorResponse('Write access was denied on the parent folder.', 403)
    )
    def create_segmentation_item(self, folder, name, base_image_id, description, reuse_existing,
                                 metadata):
        """
        Create a file and immediately set the segmentation property within it
        """
        base_image_file = File().load(base_image_id, force=True)
        if not base_image_file:
            raise GirderException('Base image ID was invalid')

        new_item = self.item_class.createItem(
            folder=folder, name=name, creator=self.getCurrentUser(),
            description=description, reuseExisting=reuse_existing
        )
        if metadata:
            new_item = self.item_class.setMetadata(item=new_item, metadata=metadata)

        new_item['segmentation'] = {
            'base_image': {
                'name': base_image_file['name'],
                '_id': base_image_file['_id'],
            }
        }
        Item().save(new_item)
        return new_item

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
        within the segmentation property.
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
            # Initialize segmentation property
            if 'segmentation' not in item:
                item['segmentation'] = {}
            # Save files that were readable to a new Item property
            item['segmentation']['images'] = image_files
            # Save the item
            Item().save(item)

    @access.user(scope=TokenScope.DATA_WRITE)
    @autoDescribeRoute(
        Description('Set a base image for this segmentation item')
        .modelParam(
            'id',
            'Item ID',
            model='item',
            level=AccessType.WRITE,
            paramType='path'
        )
        .param(
            'base_image_id',
            'Base image file ID',
        )
        .errorResponse('Base image ID was invalid')
        .errorResponse('Read permission denied on the base image item', 403)
    )
    def set_base_image(self, item, base_image_id) -> None:
        """
        Set the base image for a segmentation item
        """
        if 'segmentation' not in item:
            item['segmentation'] = {}
        base_image_file = File().load(base_image_id, force=True)
        if not base_image_file:
            raise GirderException('Base image ID was invalid')
        item['segmentation']['base_image'] = {
            'name': base_image_file['name'],
            '_id': base_image_file['_id']
        }
        Item().save(item)


def _is_readable_by_sitk(file) -> bool:
    """
    Check if a girder file is readable by SimpleITK or not.
    :param file:
    :return: whether the file is readable by SimpleITK or not
    """
    # Get original file extension
    exts = f'.{'.'.join(file['exts'])}'
    try:
        # Create a temporary file with the same extension as the original
        with tempfile.NamedTemporaryFile(suffix=exts, delete=True) as tmp:
            # Download file from Girder into temp file
            with File().open(file) as fp:
                shutil.copyfileobj(fp, tmp)
                tmp.flush()  # Ensure all data is written
            print(tmp.name)
            reader = sitk.ImageFileReader()
            reader.SetFileName(tmp.name)
            reader.ReadImageInformation()
            return True
    except RuntimeError:
        return False


def _upload_handler(event):
    """
    Whenever a new file is added to an item, check if the new file
    is readable by SimpleITK. If it is, add it to the 'images' property.
    """
    # Get the ID of the file being added. If it even is a file
    file = event.info['file']
    if not _is_readable_by_sitk(file):
        return

    item = Item().load(file['itemId'], force=True)
    # Initialize property if it does not already exist
    if 'segmentation' not in item:
        return

    if 'images' not in item['segmentation']:
        item['segmentation']['images'] = []

    item['segmentation']['images'].append({
        'name': file['name'],
        '_id': file['_id']
    })
    Item().save(item)
    events.trigger('segmentation_viewer.upload.success')


def _deletion_handler(event):
    """
    Whenever a file is about to be removed, check if it was contained
    within the 'images' property. If it is, remove it.
    """
    file = event.info
    item = Item().load(file['itemId'], force=True)

    # Check if 'images' property even exists
    if 'segmentation' not in item or 'images' not in item['segmentation']:
        return

    images = []
    for image in item['segmentation']['images']:
        if image['_id'] != file['_id']:
            images.append(image)

    if images:
        item['segmentation']['images'] = images
    else:
        del item['segmentation']['images']  # Remove the property entirely if the list is empty

    Item().save(item)
    events.trigger('segmentation_viewer.file.remove.success')
