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
    getImage: function (slice, isSeg, diffInfo, itemID) {
        if (!this._image) {
            // Cache the slice on the model
            if (isSeg) {
                return restRequest({
                    url: `/segmentation/${this.id}/segmentation_data`,
                    method: 'GET',
                })
                    .then((resp) => {
                        console.log('[ImageFileModel::getImage] seg called with response of length: ', resp);
                        this._image = resp;
                        const slicedResp = Object.assign({}, resp);
                        slicedResp.data = resp.data[slice];
                        return slicedResp;
                    });
            } else if (diffInfo) {
                // diffInfo should contain seg1_id and seg2_id
                return restRequest({
                    url: `/segmentation/diff_data/?seg1_id=${diffInfo.seg1_id}&seg2_id=${diffInfo.seg2_id}`,
                    method: 'GET',
                })
                    .then((resp) => {
                        console.log('[ImageFileModel::getImage] diff called with response: ', resp);
                        this._image = resp;
                        const slicedResp = Object.assign({}, resp);
                        slicedResp.data = resp.data[slice];
                        return slicedResp;
                    });
            } else {
                return restRequest({
                    url: `/segmentation/${itemID}/base_image_data`,
                    method: 'GET',
                })
                    .then((resp) => {
                        console.log('[ImageFileModel::getImage] base called with response of length: ', resp);
                        this._image = resp;
                        const slicedResp = Object.assign({}, resp);
                        slicedResp.data = resp.data[slice];
                        return slicedResp;
                    });
            }
        }
        
        // When image is cached, return a resolved Promise to maintain consistency
        console.log('[ImageFileModel::getImage] this._image: ', this._image);
        const slicedResp = Object.assign({}, this._image);
        slicedResp.data = this._image.data[slice];
        return Promise.resolve(slicedResp);
    },
    getSliceCount: function () {
        return this._image.data.length;
    }
});

const ImageFileCollection = FileCollection.extend({
    model: ImageFileModel,
    initialize: function () {
        FileCollection.prototype.initialize.apply(this, arguments);

        this._selectedSeg1 = null;
        this._selectedSeg2 = null;
    },
    selectSeg1Index: function (index) {
        console.log('[ImageFileCollection::selectSeg1Index] called with index: ', index);
        this._selectedSeg1 = index;
        this.trigger('g:selected-seg-1', this.at(index));
    },
    selectSeg2Index: function (index) {
        console.log('[ImageFileCollection::selectSeg2Index] called with index: ', index);
        this._selectedSeg2 = index;
        this.trigger('g:selected-seg-2', this.at(index));
    },
});

const SegImageWidget = View.extend({
    className: 'g-seg',
    initialize: function (settings) {
        console.log('[SegImageWidget::initialize] settings: ', settings);
        this._image = null;
        this._slice = 0;
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
    setImage: function (image) {
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
        glWin.setSize(256, 256);
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
            console.log('[SegImageWidget::render] mapper: ', mapper);
            this.vtk.actor.setMapper(mapper);
            console.log('[SegImageWidget::render] this.vtk.actor: ', this.vtk.actor);
        }

        this.vtk.camera = this.vtk.renderer.getActiveCameraAndResetIfCreated();
        console.log('[SegImageWidget::render] this.vtk.camera: ', this.vtk.camera);
        this.vtk.interactor.initialize();
        this.vtk.interactor.bindEvents(this.el);
        this.vtk.interactor.start();

        this.autoLevels(false);
        this.autoZoom(false);
        console.log('[SegImageWidget::render] this.vtk.interactor: ', this.vtk.interactor);
        this.vtk.interactor.render();
        console.log('[SegImageWidget::render] fater render');

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
        console.log('[SegImageWidget::_extractImageData] this._image: ', this._image);

        const imageData = vtkImageData.newInstance();
        // imageData.setOrigin(this._image.origin);
        // imageData.setOrigin(0, 0);
        imageData.setOrigin(0, 0, 0);
        // imageData.setSpacing([1, 1, 1]); // Default spacing, can be overridden
        imageData.setSpacing(this._image.spacing);
        imageData.setExtent(0, this._image.shape[0] -1, 0, this._image.shape[1] - 1, 0, 1);
        const dataArray = vtkDataArray.newInstance({ 
            values: this._image.data,
            // numberOfComponents: this._image.shape[3] || 1 // Handle grayscale or RGB images
        });

        console.log('[SegImageWidget::_extractImageData] number of components: ', this._image.shape);
        imageData.getPointData().setScalars(dataArray);
        return imageData;
    }
}, {
    imageDataCache: new WeakMap()
});

const SegItemView = View.extend({
    className: 'g-view',
    events: {
        'click .g-seg1-options a': function (event) {
            event.preventDefault();
            const index = parseInt($(event.target).data('index'));
            this._files.selectSeg1Index(index);
            this._updateDropdownText('.g-seg1-dropdown', $(event.target).text());
        },
        'click .g-seg2-options a': function (event) {
            event.preventDefault();
            const index = parseInt($(event.target).data('index'));
            this._files.selectSeg2Index(index);
            this._updateDropdownText('.g-seg2-dropdown', $(event.target).text());
        },
        'input .g-slice-slider': function (event) {
            const slice = parseInt($(event.target).val());
            this._slice = slice;
            this.$('.g-slice-value').val(slice);
            this._rerender();
        },
        'change .g-slice-value': function (event) {
            let slice = parseInt($(event.target).val());
            if (isNaN(slice)) slice = 0;
            const max = parseInt($(event.target).attr('max'));
            if (slice < 0) slice = 0;
            if (slice > max) slice = max;
            this._slice = slice;
            this.$('.g-slice-slider').val(slice);
            this.$('.g-slice-value').val(slice);
            this._rerender();
        },
        'click .g-seg-zoom-in': function (event) {
            event.preventDefault();
            this._seg1View.zoomIn();
            this._seg2View.zoomIn();
            this._baseImageView.zoomIn();
            this._diffView.zoomIn();
        },
        'click .g-seg-zoom-out': function (event) {
            event.preventDefault();
            this._seg1View.zoomOut();
            this._seg2View.zoomOut();
            this._baseImageView.zoomOut();
            this._diffView.zoomOut();
        },
        'click .g-seg-reset-zoom': function (event) {
            event.preventDefault();
            this._seg1View.autoZoom();
            this._seg2View.autoZoom();
            this._baseImageView.autoZoom();
            this._diffView.autoZoom();
        },
        'click .g-seg-auto-levels': function (event) {
            event.preventDefault();
            this._seg1View.autoLevels();
            this._seg2View.autoLevels();
            this._baseImageView.autoLevels();
            this._diffView.autoLevels();
        }
    },
    /**
     *
     * @param {ItemModel} settings.item An item with its `dicom` attribute set.
     */
    initialize: function (settings) {
        this._id = settings.item.id;
        this._files = new ImageFileCollection(settings.item.get('segmentation').images || []);
        this._baseImageFile = new ImageFileModel(settings.item.get('segmentation').base_image || {});
        this._seg1File = null;
        this._seg1Index = 0;
        this._seg2File = null;
        this._seg2Index = 1;

        this._seg1View = null;
        this._baseImageView = null;
        this._seg2View = null;
        this._diffView = null;

        this._sliceCount = null;
        this._slice = 0;

        this.listenTo(this._files, 'g:selected-seg-1', this._onSeg1SelectionChanged);
        this.listenTo(this._files, 'g:selected-seg-2', this._onSeg2SelectionChanged);
    },
    render: function () {
        this.$el.html(
            SegItemTemplate({
                files: this._files
            })
        );

        // Populate dropdowns with segmentation files
        this._populateDropdowns();

        this._seg1View = new SegImageWidget({
            el: this.$('.g-seg-1'),
            parentView: this
        });

        if (this._files.length > 0) {
            this._files.selectSeg1Index(this._seg1Index);
        }

        this._baseImageView = new SegImageWidget({
            el: this.$('.g-base'),
            parentView: this
        });

        this._setBaseImage();

        this._seg2View = new SegImageWidget({
            el: this.$('.g-seg-2'),
            parentView: this
        });

        if (this._files.length > 1) {
            this._files.selectSeg2Index(this._seg2Index);
        }

        this._diffView = new SegImageWidget({
            el: this.$('.g-seg-diff'),
            parentView: this
        });

        this._setDiffImage();

        return this;
    },
    _onSeg1SelectionChanged: function (selectedFile) {
        // this._toggleControls(false);
        this._seg1File = selectedFile;
        selectedFile.getImage(this._slice, true)
            .then((image) => {
                this._seg1View.$('.g-filename').text(selectedFile.name()).attr('title', selectedFile.name());
                this._seg1View
                    .setImage(image)
                    .rerenderSlice();
                // Update diff image if both files are selected
                this._updateDiffImageIfReady();
                // console.log('[SegItemView::_onSeg1SelectionChanged] called');
                // this._toggleControls(true);
            });
    },
    _onSeg2SelectionChanged: function (selectedFile) {
        // this._toggleControls(false);
        this._seg2File = selectedFile;
        selectedFile.getImage(this._slice, true)
            .then((image) => {
                this._seg2View.$('.g-filename').text(selectedFile.name()).attr('title', selectedFile.name());
                this._seg2View
                    .setImage(image)
                    .rerenderSlice();
                // Update diff image if both files are selected
                this._updateDiffImageIfReady();
                // console.log('[SegItemView::_onSeg2SelectionChanged] called');
                // this._toggleControls(true);
            });
    },
    _setBaseImage: function () {
        // this._toggleControls(false);
        this._baseImageFile.getImage(this._slice, false, false, this._id)
            .then((image) => {
                this._baseImageView.$('.g-filename').text(this._baseImageFile.name()).attr('title', this._baseImageFile.name());
                this._baseImageView
                    .setImage(image)
                    .rerenderSlice();
                    // console.log('[SegItemView::_setBaseImage] called');
                    // this._toggleControls(true);
                this._setSliceCount();
            });
    },
    _setDiffImage: function () {
        // Initial call - will be updated when both segmentations are selected
        this._updateDiffImageIfReady();
    },
    _updateDiffImageIfReady: function () {
        // Only proceed if both segmentation files are selected
        if (!this._seg1File || !this._seg2File) {
            console.log('[SegItemView::_updateDiffImageIfReady] Waiting for both segmentation files to be selected');
            return;
        }

        // this._toggleControls(false);
        const diffInfo = {
            seg1_id: this._seg1File.id,
            seg2_id: this._seg2File.id
        };

        // Create a temporary file model to handle the diff request
        const diffFileModel = new ImageFileModel();
        diffFileModel.getImage(this._slice, false, diffInfo)
            .then((diffImage) => {
                this.$('.g-seg-diff-filename').text('Difference').attr('title', 'Difference');
                this._diffView
                    .setImage(diffImage)
                    .rerenderSlice();
                console.log('[SegItemView::_updateDiffImageIfReady] called');

                // this._toggleControls(true);
            });
    },
    _setSliceCount: function () {
        if (!this._sliceCount) {
            let sliceCount = 0;
            try {
                sliceCount = this._baseImageFile.getSliceCount();
                console.log('[SegItemView::render] getting sliceCount: ', sliceCount);
            } catch (e) {
                console.error('[SegItemView::render] Error getting slice count:', e);
                sliceCount = 1;
            }
            console.log('[SegItemView::render] sliceCount: ', sliceCount);
            this._sliceCount = sliceCount;
        }
        this.$('.g-slice-slider').attr('max', this._sliceCount - 1).val(this._slice);
        this.$('.g-slice-value').attr('max', this._sliceCount - 1).val(this._slice);
    },
    _rerender: function () {
        this._files.selectSeg1Index(this._files._selectedSeg1);
        this._files.selectSeg2Index(this._files._selectedSeg2);
        this._setBaseImage();
        this._updateDiffImageIfReady();
    },
    _populateDropdowns: function () {
        // Clear existing options
        this.$('.g-seg1-options').empty();
        this.$('.g-seg2-options').empty();

        // Populate both dropdowns with the same files
        this._files.each((file, index) => {
            const fileName = file.name() || `Segmentation ${index + 1}`;
            
            // Add to Segmentation 1 dropdown
            this.$('.g-seg1-options').append(
                `<li><a href="#" data-index="${index}">${fileName}</a></li>`
            );
            
            // Add to Segmentation 2 dropdown
            this.$('.g-seg2-options').append(
                `<li><a href="#" data-index="${index}">${fileName}</a></li>`
            );
        });

        // Set initial dropdown text if files are available
        if (this._files.length > 0) {
            const firstFileName = this._files.at(0).name() || 'Segmentation 1';
            this._updateDropdownText('.g-seg1-dropdown', firstFileName);
            
            if (this._files.length > 1) {
                const secondFileName = this._files.at(1).name() || 'Segmentation 2';
                this._updateDropdownText('.g-seg2-dropdown', secondFileName);
            }
        }
    },
    _updateDropdownText: function (dropdownSelector, text) {
        // Update the dropdown button text while preserving the caret
        const $button = this.$(dropdownSelector).find('.dropdown-toggle');
        $button.contents().filter(function() {
            return this.nodeType === 3; // Text node
        }).remove();
        $button.prepend(text + ' ');
    },
});

export default SegItemView;
