import { wrap } from '@girder/core/utilities/PluginUtils';
import EditItemWidget from '@girder/core/views/widgets/EditItemWidget';

import SetBaseImageTemplate from '../templates/setBaseImage.pug';

// EditItemView related logic
wrap(EditItemWidget, 'render', function (render) {
    render.call(this);

    let currentBaseImage = null;
    if (this.item && this.item.has('segmentation')) {
        currentBaseImage = this.item.get('segmentation')['base_image']['_id'] || null;
    }

    this.$('.modal-body > .form-group').last().after(SetBaseImageTemplate({
        currentBaseImage: currentBaseImage,
        parentView: this
    }));

    return this;
});

/**
 * Extend edit item widget to add license field when updating an item.
 */
wrap(EditItemWidget, 'updateItem', function (updateItem) {
    const fields = arguments[1];
    fields.base_image_id = this.$('#g-base-image-id').val();
    updateItem.call(this, fields);
    return this;
});

/**
 * Extend edit item widget to add license field when creating an item.
 */
wrap(EditItemWidget, 'createItem', function (createItem) {
    const fields = arguments[1];
    fields.base_image_id = this.$('#g-base-image-id').val();
    createItem.call(this, fields);
    return this;
});
