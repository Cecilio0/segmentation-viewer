import daikon from 'daikon';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkImageMapper from 'vtk.js/Sources/Rendering/Core/ImageMapper';
import vtkInteractorStyleImage from 'vtk.js/Sources/Interaction/Style/InteractorStyleImage';
import vtkOpenGLRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderWindowInteractor from 'vtk.js/Sources/Rendering/Core/RenderWindowInteractor';

import { restRequest } from '@girder/core/rest';
import FileModel from '@girder/core/models/FileModel';
import FileCollection from '@girder/core/collections/FileCollection';
import View from '@girder/core/views/View';

import SegItemTemplate from '../templates/segItem.pug';
import '../stylesheets/segItem.styl';

const ImageFileModel = FileModel.extend({
    getImage: function () {
        console.log('[ImageFileModel::getImage] called');
        if (!this._image) {
            // Cache the slice on the model
            this._image = restRequest({
                url: `file/${this.id}/download`,
                xhrFields: {
                    responseType: 'arraybuffer'
                }
            })
                .then((resp) => {
                    return this.readImageFile(resp);
                });
        }
        return this._image;
    },
    readImageFile: function (resp) {
        const dataView = new DataView(resp);
        console.log('[ImageFileModel::readImageFile] called with response of length: ', dataView);
        return daikon.Series.parseImage(dataView);
        // return readImage(new DataView(resp))
        //     .then((image) => {
        //         console.log(image);
        //         return image;
        //     });
    }
});

const ImageFileCollection = FileCollection.extend({
    model: ImageFileModel,
    initialize: function () {
        console.log('[ImageFileCollection::initialize] called');
        FileCollection.prototype.initialize.apply(this, arguments);

        this._selectedSeg1 = null;
        this._selectedSeg2 = null;
    },
    selectSeg1Index: function (index) {
        console.log(this.getTotalCount());
        console.log(this.at(index));
        this._selectedSeg1 = index;
        this.trigger('g:selected-seg-1', this.at(index), index);
    },
    selectSeg2Index: function (index) {
        console.log(this.getTotalCount());
        console.log(this.at(index));
        this._selectedSeg2 = index;
        this.trigger('g:selected-seg-2', this.at(index), index);
    },
});

const SegImageWidget = View.extend({
    className: 'g-seg',
    initialize: function (settings) {
        console.log('[SegImageWidget::initialize] called');
        this._image = null;
        this._segmentation = null;
        this.vtk = {
            renderer: null,
            actor: null,
            camera: null,
            interactor: null
        };
    },
    destroy: function () {
        if (this.vtk.interactor) {
            this.vtk.interactor.unbindEvents(this.el);
        }
        View.prototype.destroy.apply(this, arguments);
    },
    setBaseImage: function (image) {
        this._image = image;
        return this;
    },
    /**
     * Do a full render.
     *
     * May be called without calling `setSlice` first.
     */
    render: function () {
        this.vtk.renderer = vtkRenderer.newInstance();
        this.vtk.renderer.setBackground(0.33, 0.33, 0.33);

        const renWin = vtkRenderWindow.newInstance();
        renWin.addRenderer(this.vtk.renderer);

        const glWin = vtkOpenGLRenderWindow.newInstance();
        glWin.setContainer(this.el);
        glWin.setSize(502, 224);
        renWin.addView(glWin);

        this.vtk.interactor = vtkRenderWindowInteractor.newInstance();
        const style = vtkInteractorStyleImage.newInstance();
        this.vtk.interactor.setInteractorStyle(style);
        this.vtk.interactor.setView(glWin);

        this.vtk.actor = vtkImageSlice.newInstance();
        this.vtk.renderer.addActor(this.vtk.actor);

        if (this._image) {
            const mapper = vtkImageMapper.newInstance();
            mapper.setInputData(this._getImageData());
            this.vtk.actor.setMapper(mapper);
        }

        this.vtk.camera = this.vtk.renderer.getActiveCameraAndResetIfCreated();

        this.vtk.interactor.initialize();
        this.vtk.interactor.bindEvents(this.el);
        this.vtk.interactor.start();

        this.autoLevels(false);
        this.autoZoom(false);
        this.vtk.interactor.render();

        return this;
    },
    /**
     * Cheaply update the rendering, usually after `setSlice` is called.
     */
    rerenderSlice: function () {
        if (this.vtk.renderer) {
            if (this._image) {
                const mapper = vtkImageMapper.newInstance();
                mapper.setInputData(this._getImageData());
                this.vtk.actor.setMapper(mapper);
            }
            this.vtk.interactor.render();
        } else {
            this.render();
        }
        return this;
    },
    /**
     * Requires `render` to be called first.
     */
    autoLevels: function (rerender = true) {
        const range = this._getImageData().getPointData().getScalars().getRange();
        const ww = range[1] - range[0];
        const wc = (range[0] + range[1]) / 2;
        this.vtk.actor.getProperty().setColorWindow(ww);
        this.vtk.actor.getProperty().setColorLevel(wc);

        if (rerender) {
            this.vtk.interactor.render();
        }
        return this;
    },
    /**
     * Requires `render` to be called first.
     */
    autoZoom: function (rerender = true) {
        this.vtk.renderer.resetCamera();
        this.vtk.camera.zoom(1.44);

        const up = [0, -1, 0];
        const pos = this.vtk.camera.getPosition();
        pos[2] = -Math.abs(pos[2]);
        this.vtk.camera.setViewUp(up[0], up[1], up[2]);
        this.vtk.camera.setPosition(pos[0], pos[1], pos[2]);

        if (rerender) {
            this.vtk.interactor.render();
        }
        return this;
    },
    /**
     * Requires `render` to be called first.
     */
    zoomIn: function () {
        this.vtk.camera.zoom(9 / 8);
        this.vtk.interactor.render();
        return this;
    },
    /**
     * Requires `render` to be called first.
     */
    zoomOut: function () {
        this.vtk.camera.zoom(8 / 9);
        this.vtk.interactor.render();
        return this;
    },
    _getImageData: function () {
        let tags;
        if (!SegImageWidget.imageDataCache.has(this._image)) {
            tags = this._extractImageData();
            SegImageWidget.imageDataCache.set(this._image, tags);
        } else {
            return SegImageWidget.imageDataCache.get(this._image);
        }
        return tags;
    },
    _extractImageData: function () {
        const rows = this._image.getRows();
        const cols = this._image.getCols();
        const rowSpacing = this._image.getPixelSpacing()[0];
        const colSpacing = this._image.getPixelSpacing()[1];

        const imageData = vtkImageData.newInstance();
        imageData.setOrigin(0, 0, 0);
        imageData.setSpacing(colSpacing, rowSpacing, 1);
        imageData.setExtent(0, cols - 1, 0, rows - 1, 0, 0);

        const values = this._image.getInterpretedData();
        const dataArray = vtkDataArray.newInstance({ values: values });
        imageData.getPointData().setScalars(dataArray);

        return imageData;
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
            this._files.selectSeg2Index(1);
        }
    },
    /**
     *
     * @param {ItemModel} settings.item An item with its `dicom` attribute set.
     */
    initialize: function (settings) {
        console.log('[SegItemView::initialize] called');
        this._files = new ImageFileCollection(settings.item.get('segmentation').images || []);
        this._baseImageFile = new ImageFileModel(settings.item.get('segmentation').base_image || {});
        console.log('[SegItemView::initialize] this._files: ', this._files);
        console.log('[SegItemView::initialize] this._baseImageFile: ', this._baseImageFile);

        this._seg1View = null;
        this._baseImageView = null;
        this._seg2View = null;
        this._diffView = null;

        this._setBaseImage();

        this.listenTo(this._files, 'g:selected-seg-1', this._onSeg1SelectionChanged);
        this.listenTo(this._files, 'g:selected-seg-2', this._onSeg2SelectionChanged);
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
                this.$('.g-seg-1-filename').text(selectedFile.name()).attr('title', selectedFile.name());
                // this._sliceImageView
                //     .setSlice(image)
                //     .rerenderSlice();
            })
            .always(() => {
                console.log('[SegItemView::_onSeg1SelectionChanged] called');
                // this._toggleControls(true);
            });
    },
    _onSeg2SelectionChanged: function (selectedFile, selectedIndex) {
        // this._toggleControls(false);
        selectedFile.getImage()
            .done((image) => {
                this.$('.g-seg-2-filename').text(selectedFile.name()).attr('title', selectedFile.name());
                // this._sliceImageView
                //     .setSlice(image)
                //     .rerenderSlice();
            })
            .always(() => {
                console.log('[SegItemView::_onSeg2SelectionChanged] called');
                // this._toggleControls(true);
            });
    },
    _setBaseImage: function () {
        // this._toggleControls(false);
        this._baseImageFile.getImage()
            .done((image) => {
                this.$('.g-base-filename').text(this._baseImageFile.name()).attr('title', this._baseImageFile.name());
                this._baseImageView
                    .setBaseImage(image)
                    .rerenderSlice();
            })
            .always(() => {
                console.log('[SegItemView::_onBaseImageSelectionChanged] called');
                // this._toggleControls(true);
            });
    },
});

export default SegItemView;
