// import _ from 'underscore';
// import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
// import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
// import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
// import vtkImageMapper from 'vtk.js/Sources/Rendering/Core/ImageMapper';
// import vtkInteractorStyleImage from 'vtk.js/Sources/Interaction/Style/InteractorStyleImage';
// import vtkOpenGLRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow';
// import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
// import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
// import vtkRenderWindowInteractor from 'vtk.js/Sources/Rendering/Core/RenderWindowInteractor';

import { restRequest } from '@girder/core/rest';
import FileModel from '@girder/core/models/FileModel';
import FileCollection from '@girder/core/collections/FileCollection';
import View from '@girder/core/views/View';

import SegItemTemplate from '../templates/segItem.pug';
import '../stylesheets/segItem.styl';

const ImageFileModel = FileModel.extend({
    getImage: function () {
        console.log('[ImageFileModel::getImage] called');
        if (!this._slice) {
            // Cache the slice on the model
            this._slice = restRequest({
                url: `file/${this.id}/download`,
                xhrFields: {
                    responseType: 'arraybuffer'
                }
            })
                .then((resp) => {
                    console.log(resp);
                    return new DataView(resp);
                });
        }
        return this._slice;
    }
});

const ImageFileCollection = FileCollection.extend({
    model: ImageFileModel,

    initialize: function () {
        console.log('[ImageFileCollection::initialize] called');
        FileCollection.prototype.initialize.apply(this, arguments);

        this._selectedBase = null;
        this._selectedSeg1 = null;
        this._selectedSeg2 = null;
    },

    selectSeg1Index: function (index) {
        this._selectedSeg1 = index;
        this.trigger('g:selected-seg-1', this.at(index), index);
    },
});

const SegImageWidget = View.extend({
    className: 'g-seg',

    initialize: function (settings) {
        console.log('[SegImageWidget::initialize] called');
        this._slice = null;
        // this.vtk = {
        //     renderer: null,
        //     actor: null,
        //     camera: null,
        //     interactor: null
        // };
    },

    destroy: function () {
        // if (this.vtk.interactor) {
        //     this.vtk.interactor.unbindEvents(this.el);
        // }
        View.prototype.destroy.apply(this, arguments);
    }
}, {
    imageDataCache: new WeakMap()
});

const SegItemView = View.extend({
    className: 'g-view',
    events: {
        // 'click .g-dicom-first': function (event) {
        //     this._files.selectSeg1Index(parseInt(event.target.value));
        // },
        'click .g-test': function (event) {
            this._files.selectSeg1Index(0);
        }
    },
    /**
     *
     * @param {ItemModel} settings.item An item with its `dicom` attribute set.
     */
    initialize: function (settings) {
        console.log('[SegItemView::initialize] called');
        this._files = new ImageFileCollection(settings.item.get('images').files);

        this._seg1View = null;
        this._baseImageView = null;
        this._seg2View = null;
        this._diffView = null;

        this.listenTo(this._files, 'g:selected-seg-1', this._onSeg1SelectionChanged);
        this.listenTo(this._files, 'g:selected-base', this._onSeg1SelectionChanged);
        this.listenTo(this._files, 'g:selected-seg-2', this._onSeg1SelectionChanged);
        this.listenTo(this._files, 'g:selected-seg-diff', this._onSeg1SelectionChanged);
    },
    render: function () {
        this.$el.html(
            SegItemTemplate({
                files: this._files
            })
        );

        this._seg1View = new SegImageWidget({
            el: this.$('.g-seg-1'),
            parentView: this
        });

        this._baseImageView = new SegImageWidget({
            el: this.$('.g-base'),
            parentView: this
        });

        this._seg2View = new SegImageWidget({
            el: this.$('.g-seg-2'),
            parentView: this
        });

        this._diffView = new SegImageWidget({
            el: this.$('.g-seg-diff'),
            parentView: this
        });

        return this;
    },
    _onSeg1SelectionChanged: function (selectedFile, selectedIndex) {
        // this._toggleControls(false);
        selectedFile.getImage()
            .done((image) => {
                this.$('.g-seg-1.g-filename').text(selectedFile.name()).attr('title', selectedFile.name());
                // this.$('.g-dicom-slider').val(selectedIndex);

                // this._sliceMetadataView
                //     .setSlice(image)
                //     .render();
                // this._sliceImageView
                //     .setSlice(image)
                //     .rerenderSlice();
            })
            .always(() => {
                console.log('[SegItemView::_onSeg1SelectionChanged] called');
                // this._toggleControls(true);
            });
    }
});

export default SegItemView;
