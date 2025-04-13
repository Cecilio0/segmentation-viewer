import { wrap } from '@girder/core/utilities/PluginUtils';
import { ItemView } from '@girder/core/views/body';

wrap(ItemView, 'render', function (render) {
    this.once('g:rendered', () => {
        // Check if the user has permissions to extract image data
        console.log('Rendered');
    });
    return render.call(this);
});
