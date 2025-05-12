import $ from 'jquery';
import _ from 'underscore';

import SetBaseImageTemplate from '../templates/setBaseImage.pug'
import UploadWidget from '@girder/core/views/widgets/UploadWidget';
import { wrap } from '@girder/core/utilities/PluginUtils';
import { restRequest } from '@girder/core/rest';

wrap(UploadWidget, 'render', function (render) {
    render.call(this);
    if (this.parentType == 'folder') {
        const setBaseImageTemplate = SetBaseImageTemplate({
            currentBaseImage: null,
            parentView: this
        });
        if (this.modal) {
            this.$('.modal-body').append(setBaseImageTemplate);
        } else {
            this.$('.g-nonmodal-upload-buttons-container').before(setBaseImageTemplate);
        }
    }

    return this;
});

/**
 * Set item license when file upload is complete.
 */
wrap(UploadWidget, 'uploadNextFile', function (uploadNextFile) {
    uploadNextFile.call(this);
    var file = this.currentFile;
    if (file) {
        file.on('g:upload.complete', function () {
            var baseImageId = this.$('#g-base-image-id').val();
            if (!_.isEmpty(baseImageId)) {
                restRequest({
                    method: 'POST',
                    url: `item/${file.get('itemId')}/set_base_image?base_image_id=${baseImageId}`,
                    error: null
                })
            }
        }, this);
    }

});
