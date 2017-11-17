var ANAV, SMA_NAV_DATE, LP_NAV_DATE, MMF_DATE, RA_DATE, VF_DATE;

var SHORT_TERM_STATS = ['Cash', 'Total', 'VFN', 'Allocations', 'Flows', 'SMA Funding', 'Liquidity'];
var padded = false;
var sliderExpanded = true;

var toSwitch = [];

var INV_PROD_ABBREVS = {
	SSIF: 369,
	CSS: 66,
	SSALT: 7000017,
	COSS: 7000072
};

function initCols(callback) {
    getProducts(callback);
    kendo.ui.progress($('#grid'), true);
}

//adds padding to totals grid so that it doesnt get misaligned when youre scrolling over.
function addTotalsPadding(){
	var cur=$('#totals-grid .k-grid-content colgroup > col:last').width();
	cur+=60;
	$('#totals-grid .k-grid-content colgroup > col:last').width(cur);
	padded = true;
}

function removeTotalsPadding(){
	var cur=$('#totals-grid .k-grid-content colgroup > col:last').width();
	cur-=60;
	$('#totals-grid .k-grid-content colgroup > col:last').width(cur);
	padded = false;
}

function updateGrid(data, container, column) {
    var id = data.StrategyId + ':' + data.InvestmentId,
    	dataItem;
    if (data.kuid) {
    	dataItem = $('#grid').data('kendoGrid').dataSource.getByUid(data.kuid);
    } else {
    	dataItem = $('#grid').data('kendoGrid').dataSource.get(id);
    }
    data.FUND_TYPE = dataItem.FUND_TYPE;
    data.StrategyName = dataItem.StrategyName;
    data.CompositeId = dataItem.CompositeId;
    data.Composite = dataItem.Composite;
    data.ProductName = dataItem.ProductName;
    data.InvestmentName = dataItem.InvestmentName;
    data.IS_DEFAULT = dataItem.IS_DEFAULT;
    data.uid = mioSwampDragon.generateUid();
    var prodId = (data.ProductId == 7000001) ? 7000017 : data.ProductId,
    	dataKey = _products[_product_ids.indexOf(prodId)];
    data.SettlementAmount = dataItem[dataKey][data.Date].SETTLEMENT_AMOUNT;
    data.LetterSentDate = dataItem[dataKey][data.Date].LETTER_SENT_DATE;
    data.ShareClass = dataItem[dataKey][data.Date].SHARE_CLASS;
    data.ExecutionInstruction = dataItem[dataKey][data.Date].EXECUTION_INSTRUCTION;
    data.InternalComments = data.targetStatus == 'CANCELLED' ? '' : dataItem[dataKey][data.Date].INTERNAL_COMMENTS;
    dataItem[dataKey][data.Date].INTERNAL_COMMENTS = data.InternalComments;
    data.ALLOCATION_NOTES = data.targetStatus == 'CANCELLED' ? '' : dataItem[dataKey][data.Date].ALLOCATION_NOTES;
    dataItem[dataKey][data.Date].ALLOCATION_NOTES = data.ALLOCATION_NOTES;
    dataItem[dataKey][data.Date].INTERNAL_COMMENTS = data.InternalComments;
    data.EstimatedSettlementDate = dataItem[dataKey][data.Date].ESTIMATED_SETTLEMENT_DATE;
    data.ActualSettlementDate = dataItem[dataKey][data.Date].ACTUAL_SETTLEMENT_DATE;
    data.originalValue = data.originalValue || 0;
    data.CurrentNav = dataItem[dataKey][_dates[0]].EndBalance * 1000000 || null;
    var otherItemId;  // clone of dataItem or non-clone of which dataItem is a clone
    if (!(data.IS_DEFAULT || data.AllocationValueId)) {
    	otherItemId = '{0}:{1}'.formatStr([data.StrategyId, data.InvestmentId]);
    } else if (data.IS_DEFAULT && !data.AllocationValueId) {
    	otherItemId = '{0}:{1}:clone'.formatStr([data.StrategyId, data.InvestmentId]);
    }
	var otherItem = otherItemId ? $('#grid').data('kendoGrid').dataSource.get(otherItemId) : null;
	if (otherItem) {
    	var allocation = otherItem[dataKey][data.Date];	
    	data.AllocationId = allocation.AllocationId;
    	data.Status = allocation.Status;
    	data.NEXT_NOTICE_DATE = allocation.NEXT_NOTICE_DATE;
	}

    return (function (dataItem, container) {
		return APSDataService.post({
	        url: window.ALLOCATION_SHEET_SAVE_URL,
	        svc_module: 'save_data_service',
	        svc_function: 'save_allocation',
	        data: data,
	        success: function (resp) {
	        	(function(dataItem, container) {
		            if (resp.status == 'success') {
		            	updateAndRecalcGridCells(resp.data, container, dataItem);
		            	redisCacheManager.updateNamespace('Allocations', 3000);
		            } else {
		                toastAlert(resp.display_msg, resp.errors, resp.status);
		            }
	        	})(dataItem, container);
	        },
	    });
    })(dataItem, container);
}

function updateAndRecalcGridCells(data, container, dataItem) {
	setGridData($('#grid'), data, container, dataItem);
    console.log('Decision was updated:',  data);
    var date = data.Date;
    var product = getProductName(parseInt(data.ProductId));
	setTimeout(function () {
    	apsAnchorCalcs.refresh();
    	shortTermCalcs.refresh(date, product);
	}, 0);
}

function getASData(params) {
	var offlineEnabled = window.OFFLINE_ENABLED && !params.as_of;
    return APSDataService.get({
        url: window.ALLOCATION_SHEET_DATA_URL,
        svc_module: 'get_data_service',
        svc_function: 'get_aps_data',
        appcache: offlineEnabled && { compressed: { remote: true } },
        data: params
    });
}

function getSMAManagers(params) {
	var offlineEnabled = window.OFFLINE_ENABLED && !params.as_of;
    return APSDataService.get({
        svc_module: 'sma_allocations',
        svc_function: 'get_ap_sma_nav_alloc_data',
        appcache: offlineEnabled && { compressed: { remote: true } },
        data: params
    });
}

function getPlaceholderManagers(params) {
	var offlineEnabled = window.OFFLINE_ENABLED && !params.as_of;
    return APSDataService.get({
        svc_module: 'dal_service',
        svc_function: 'get_placeholder_manager_data',
        appcache: offlineEnabled && { compressed: { remote: true } },
        data: params
    });
}

function getCloneManagers(params) {
	var offlineEnabled = window.OFFLINE_ENABLED && !params.as_of;
    return APSDataService.get({
        svc_module: 'dal_service',
        svc_function: 'get_clone_manager_data',
        appcache: offlineEnabled && { compressed: { remote: true } },
        data: params
    });
}

function getTradingBooks(params) {
	var offlineEnabled = window.OFFLINE_ENABLED && !params.as_of;
    return APSDataService.get({
        svc_module: 'dal_service',
        svc_function: 'get_trading_book_data',
        appcache: offlineEnabled && { compressed: { remote: true } },
        data: params
    });
}

function getShortTermSectionData(params) {
	var offlineEnabled = window.OFFLINE_ENABLED && !params.as_of;
    return APSDataService.get({
    	url: window.APS_DATAFEED_URL,
        svc_module: 'get_data_service',
        svc_function: 'get_aps_datafeed_data',
        appcache: offlineEnabled && { compressed: { remote: true } },
        data: params
    });
}

function getStatsSectionData(params) {
	var offlineEnabled = window.OFFLINE_ENABLED && !params.as_of;
    return APSDataService.get({
        svc_module: 'get_data_service',
        svc_function: 'get_stats_section_data',
        appcache: offlineEnabled && { compressed: { remote: true } },
        data: params
    });
}

/*function getExposuresGroupData(params) {
	var offlineEnabled = window.OFFLINE_ENABLED && !params.as_of;
    return APSDataService.get({
    	url: window.EXPOSURE_GROUP_LIST,
        appcache: offlineEnabled && { compressed: { remote: true },  key: 'exposures_group'},
        data: params
    });
}*/

function getAllocationSheetSort() {
    return APSDataService.get({
        svc_module: 'get_data_service',
        svc_function: 'get_allocation_sheet_sort',
        appcache: window.OFFLINE_ENABLED && { compressed: true }
    });
}

//takes a callback so that an additional function will wait for this asynchronous function to finish
function getProducts(callback) {
	var params = mioUtils.parseURLQuery();
    $.when(
    	getASData(params),
    	getSMAManagers(params),
    	getPlaceholderManagers(params),
    	getCloneManagers(params),
    	getTradingBooks(params),
    	getShortTermSectionData(params),
    	getStatsSectionData(params),
    	getAllocationSheetSort(),
    	//getExposuresGroupData(params),
    	AllocationSheetGrid.refreshLiquidityTerms()
    ).then(function (allocations, sma_allocations, placeholders, clones, tradingBooks, shortTerm, stats, gridSort) {
    	console.time('UI rendering');

        if (allocations.errors) {
            handleError(allocations.display_msg, allocations.errors);
        } else {
    		toastAlert(stats.display_msg, stats.traceback, stats.status);
    		toastAlert(placeholders.display_msg, placeholders.traceback, placeholders.status);
    		toastAlert(clones.display_msg, clones.traceback, clones.status);
    		toastAlert(tradingBooks.display_msg, tradingBooks.traceback, tradingBooks.status);
    		//toastAlert(exposuresGroupData.display_msg, exposuresGroupData.traceback, exposuresGroupData.status);

            _aps_data = allocations.aps_data.concat(sma_allocations.data, stats.data, placeholders.data, shortTerm.data, clones.data, tradingBooks.data);
            _aps_data = _aps_data.filter(Boolean);
            
            SMA_NAV_DATE = kendo.parseDate(sma_allocations.sma_nav_date, 'yyyy-MM-dd');
            LP_NAV_DATE = kendo.parseDate(allocations.lp_nav_date, 'yyyy-MM-dd');
            _products = allocations.products;
            _dates = allocations.dates;
            _product_ids = allocations.prod_ids;
            TotalCashDelta = shortTerm['Total Cash Delta'];
            ANAV = stats.ANAV;
            //EXPOSURES = exposuresGroupData.data;
            calculateTotalANAV();  // TODO: do this on server side

            var userViews = gridSort.user_views;
            if (userViews) {
                userViews = JSON.parse(userViews);
                if (userViews.length) {
                    sortedComposites = JSON.parse(userViews[0].fields.setting_value);
                }
            }

            callback();

            
        }
    });
}


function dataBind(e) {

    var groups = e.items;
    for (var i in groups) {
    	
        if (groups[i].hasSubgroups) {
            dataBind(groups[i]);
        }
        if (groups[i].aggregates) {
            if (!groups[i].aggregates.StrategyName) {
                groups[i].aggregates.StrategyName = {};
            }
            if (groups[i].field == 'StrategyGroup') {
                groups[i].aggregates.StrategyName['groupField'] = 'StrategyName';
            } else {
                groups[i].aggregates.StrategyName['groupField'] = groups[i].field;
            }
            if (['CompositeGroup', 'StrategyGroup'].indexOf(groups[i].field) >= 0) {
                groups[i].aggregates.StrategyName['groupValue'] = parseNameFromSortName(groups[i].value);
            } else {
                groups[i].aggregates.StrategyName['groupValue'] = groups[i].value;
            }
        }
    }
}

function getAggregates() {
	if (!window._aggregates) {
		_aggregates = [{ field: 'StrategyName', aggregate: 'count' }, { field: 'ssifTest1', aggregate: 'sum' }, { field: 'CompositeId', aggregate: 'min' }];
	    for (var i = 0; i < _products.length; i++) {
	        for (var j = 0; j < _dates.length; j++) {
	        	_aggregates.push({ field: '{0}.{1}.EndBalance'.formatStr([_products[i], _dates[j]]), aggregate: 'sum' });
	        	_aggregates.push({ field: '{0}.{1}.EQUITY_NAV'.formatStr([_products[i], _dates[j]]), aggregate: 'sum' });
	        	_aggregates.push({ field: '{0}.{1}.NEXT_NOTICE_DATE'.formatStr([_products[i], _dates[j]]), aggregate: 'min' });
	        	_aggregates.push({ field: '{0}.{1}.LEVERAGE_FACTOR'.formatStr([_products[i], _dates[j]]), aggregate: 'average' });
	        	_aggregates.push({ field: '{0}.{1}.WF_CODE'.formatStr([_products[i], _dates[j]]), aggregate: 'min' });
	        	_aggregates.push({ field: '{0}.{1}.SHOW_ZERO'.formatStr([_products[i], _dates[j]]), aggregate: 'max' });
	        }
	        _aggregates.push({ field: _products[i] + '.New', aggregate: 'sum' });
	    }
	    for (var j = 0; j < _dates.length; j++) {
	    	_aggregates.push({ field: 'ssifTest2.{0}.EndBalance'.formatStr([_dates[j]]), aggregate: 'sum' });
	    	_aggregates.push({ field: 'ssifTest2.{0}.unique'.formatStr([_dates[j]]), aggregate: 'average' });
	    }
	}
    return _aggregates;
}

function getColumns() {
    var separatorAttributes = { 'class': 'section-separator' },
        curExpTemplate = getExposureTemplate(null, _dates[0]),
        curExpFooterTemplate = getExposureFooterTemplate(null, _dates[0]),
        newExpTemplate = getExposureTemplate(null, _dates[_dates.length - 1]),
        newExpFooterTemplate = getExposureFooterTemplate(null, _dates[_dates.length - 1]);
    var columns = [
        { field: 'MgrType', hidden: true, attributes: { 'class': 'mgr-type' } },
        {
            field: 'GridSection',
            title: 'Grid Section',
            attributes: { 'title':'this is a MgrType'  },
            groupHeaderTemplate: '<span data-group-value="#= value #" data-group-field="GridSection">#= value || " " #</span>',
            width: 250,
            locked: true,
            lockable: false,
            hidden: true
        },
        {
            field: 'InvestmentName',
            title: 'Investment',
            attributes: { 'title':'#= getTempTitles(data)#', 'class': 'simple-qtip',},// 'style': 'padding-left: #= data.shortTermPadded != undefined ? "4em" : "none" #'},
            groupHeaderTemplate: '<span class="simple-qtip" data-group-value="#= parseNameFromSortName(value) #" data-group-field="InvestmentName"  #= data.measure ? "data-measure=\'" + data.measure + "\'" : "" #>#= value || " " #</span>',
            template: '<div style="position:relative"><div class="investment-name '  + '#= data.IS_PLACEHOLDER ? "dummy" :  data.GridSection == "Exposures" ? "exposure-group" : "" #' + '">' + '#= data.InvestmentName ##= (data.IS_DEFAULT || data.GridSection != "Allocations") ? "" : " Clone" #</div>' + '#= hasContextChevron(data) ? "<i class=\'glyphicon glyphicon-chevron-down context-chevron\' style=\'float:right; right:0.5em;\'></i>" : "" #</div>',
            width: allocSheetCellWidths.InvestmentName,
            locked: true,
            lockable: false
        },
        {
            field: 'Composite',
            groupHeaderTemplate: '<span title="#= value #" data-group-value="#= value #" data-group-field="Composite">#= value || " " #</span>',
            width: 125,
            locked: true,
            lockable: false,
            hidden: true
        },
        {
            field: 'CompositeGroup',
            
            groupHeaderTemplate: '<span title="#= parseNameFromSortName(value) #" data-group-value="#= parseNameFromSortName(value) #" data-group-field="CompositeGroup">#= value || " " #</span>',
            groupHeaderAttributes: { 'style': '#= getCompositeGroupStyle(data) #' },
            hidden: true
        },
        {
            field: 'StrategyName',
            title: 'Strategy',
           
            groupHeaderTemplate: '<span data-group-value="#= value #" data-group-field="StrategyName">#= value || " " #</span>',
            groupFooterTemplate: '<span data-group-value="#= data.StrategyName.groupValue #" data-group-field="#= data.StrategyName.groupField #"></span>',
            width: 125,
            locked: true,
            lockable: false,
            hidden: true
        },
        {
            field: 'StrategyGroup',
           
            groupHeaderTemplate: '<span title="#= parseNameFromSortName(value) #" data-group-value="#= parseNameFromSortName(value) #" data-group-field="StrategyName">#= value || " " #</span>',
            hidden: true
        }
        
        
    ];
    var monthSliderTemplate = kendo.template($('#month-slider-template').html());
    for (var i = 0; i < _products.length; i++) {
        var firstProd = (i === 0),
        	headerData = { product: _products[i], title: prodAbbrevs[_product_ids[i]].replace(/SSALT/g, 'SS'), min: 3, max: _dates.length - 1, style: 'position: absolute;' };
        columns.push({
            headerTemplate: monthSliderTemplate(headerData),
            headerAttributes: { 'data-prodname': _products[i] },
            title: _products[i],
            columns: getDateColumns(_products[i], firstProd)
        });
    }

    var testAttributes = deepCopy(separatorAttributes),
    	testHeaderAttributes = { 'class': 'tests-column' },
    	ssifTest2HeaderAttributes = { 'class': 'tests-column ssif-test-2', 'data-header-section': 'ssiftest2' },
    	testHeaderData = { title: 'Test 2', min: 1, max: _dates.length - 1, 'default': 1, testSection: 'ssiftest2' },
    	ssifTest1Attributes = $.extend(true, {}, testAttributes, { 'data-field': 'ssiftest1.cur' });
    testAttributes['class'] += ' tests-column cur';
    ssifTest1Attributes['class'] += ' tests-column cur';

    columns = columns.concat([
        {
            title: 'Test 1',
        	section: 'ssiftest1',
            headerAttributes: Object.assign({}, testHeaderAttributes, { 'data-header-section': 'ssiftest1' }),
            columns: [
                {
                    title: 'Cur',
                    field: 'ssiftest1.cur',
                    template: ssifTest1Template,
                    groupFooterTemplate: ssifTest1FooterTemplate,
                    attributes: ssifTest1Attributes,
                    headerAttributes: testHeaderAttributes,
                    footerAttributes: ssifTest1Attributes,
                    groupFooterAttributes: ssifTest1Attributes,
                    width: allocSheetCellWidths.ssifTest1,
                    hidden: true
                }
            ]
        },
        {
            title: testHeaderData.title,
        	section: 'ssiftest2',
            headerTemplate: monthSliderTemplate(testHeaderData),
            headerAttributes: ssifTest2HeaderAttributes,
            columns: getSSIFTest2Columns()
        }
    ]);

    columns = columns.concat(getProdExpCols());

    var totalAttributes = { 'style': 'text-align:right;', 'class': 'totals-column numeric' },
    	totalNewAttributes = $.extend(true, {}, totalAttributes, { 'class': 'simple-qtip addHoverNew numeric','data-field': 'totals.new' }),
    	totalDeltaAttributes = $.extend(true, {}, totalAttributes, { 'data-field': 'totals.delta' }),
    	totalHeaderAttributes = { 'class': 'totals-column' },
        curTotalAttributes = $.extend(true, {}, separatorAttributes, totalAttributes, { 'class': 'simple-qtip addHoverCur', 'data-field': 'totals.cur' });
    curTotalAttributes['class'] += ' section-separator cur';
    totalDeltaAttributes['style'] += '#= getSSCompositeDelta(data) < 0 ? "color: red;" : "" #';

	curTotalAttributesTitleCur = $.extend(true, {}, separatorAttributes, totalAttributes, {'class':'simple-qtip addHoverCur section-separator cur', 'data-field': 'totals.cur'});
	curTotalAttributesTitleNew = $.extend(true, {}, separatorAttributes, totalAttributes, {'class':'simple-qtip addHoverNew', 'data-field': 'totals.new' }); //#= data.FUND_TYPE == "SMA" ? "addHoverNew" : "" #
	
	console.time('Adding totals cur and total new');
    var totalCols = [];
    
    totalCols.push({
            title: 'Cur',
            field: 'totals.cur',
            template: getSSCompositeCurExposuresTemplate(),
            groupFooterTemplate: getSSCompositeCurExposuresTemplate(true),
            //attributes: { 'class': 'numeric section-separator exposure all-prods cur','data-field': 'exposures.totals.cur', 'title': '#= (data)#' },
            attributes: { 'class': 'numeric section-separator totals all-prods cur','data-field': 'totals.cur' },
            headerAttributes: { 'class': 'numeric section-separator totals all-prods cur' },
              footerAttributes: { 'class': 'numeric section-separator totals all-prods cur markedForQtip-new simple-qtip', 'data-field': 'totals.cur' },
            // footerAttributes: { 'class': 'numeric section-separator totals all-prods cur', 'data-field': 'exposures.totals.cur' },
            groupFooterAttributes: { 'class': 'numeric section-separator totals all-prods cur', 'data-field': 'totals.cur' },
            editor: readOnlyEditor,
            exposureField: 'Cur',
            width: allocSheetCellWidths.totals
    }); 

    totalCols = totalCols.concat(getDateTotalsCols());
    
    totalCols.push({
            title: getNewColumnName(),
            field: 'totals.new',
            editor: readOnlyEditor,
            template: getSSCompositeNewExposuresTemplate(),
            groupFooterTemplate: getSSCompositeNewExposuresTemplate(true),
            attributes: { 'class': 'numeric totals all-prods new', 'data-field': 'totals.new' },
            headerAttributes: { 'class': 'numeric totals all-prods new' },
             footerAttributes: { 'class': 'numeric totals all-prods new simple-qtip', 'data-field': 'totals.new' },
             //  footerAttributes: { 'class': 'numeric totals all-prods new', 'title':'test', 'data-field': 'totals.new'},
            groupFooterAttributes: { 'class': 'numeric totals all-prods new', 'data-field': 'totals.new' },
            exposureField: 'New',
            width: allocSheetCellWidths.totals
    });
    
    console.timeEnd('Adding totals cur and total new');
	var totalHeaderData = { testSection: 'exposure', title: 'SS Composite', min: 0, max: _dates.length - 1, 'default': 0 };
    columns.push({
    	title: totalHeaderData.title,
        section: 'exposure',
    	headerTemplate: monthSliderTemplate(totalHeaderData),
    	headerAttributes: { 'data-header-section': 'exposure' },
    	columns: totalCols
    });
    	
    console.time('Adding exposure totals cur and exposures total new');
    var totalCols = [];
    
    totalCols.push({
            title: 'Cur',
            field: 'exposures.totals.cur',
            template: curExpTemplate,
            groupFooterTemplate: curExpFooterTemplate,
            //attributes: { 'class': 'numeric section-separator exposure all-prods cur','data-field': 'exposures.totals.cur', 'title': '#= (data)#' },
            attributes: { 'class': 'numeric section-separator exposure all-prods cur','data-field': 'exposures.totals.cur' },
            headerAttributes: { 'class': 'numeric section-separator exposure all-prods cur' },
              footerAttributes: { 'class': 'numeric section-separator exposure all-prods cur markedForQtip-new simple-qtip', 'data-field': 'exposures.totals.cur' },
            // footerAttributes: { 'class': 'numeric section-separator exposure all-prods cur', 'data-field': 'exposures.totals.cur' },
            groupFooterAttributes: { 'class': 'numeric section-separator exposure all-prods cur', 'data-field': 'exposures.totals.cur' },
            editor: readOnlyEditor,
            exposureField: 'Cur',
            width: allocSheetCellWidths.exposures.totals.cur
    }); 

    totalCols = totalCols.concat(getDateExpCols());
    
    totalCols.push({
            title: getNewColumnName(),
            field: 'exposures.totals.new',
            editor: readOnlyEditor,
            template: newExpTemplate,
            groupFooterTemplate: newExpFooterTemplate,
            attributes: { 'class': 'numeric exposure all-prods new', 'data-field': 'exposures.totals.new' },
            headerAttributes: { 'class': 'numeric exposure all-prods new' },
             footerAttributes: { 'class': 'numeric exposure all-prods new simple-qtip', 'data-field': 'exposures.totals.new' },
             //  footerAttributes: { 'class': 'numeric exposure all-prods new', 'title':'test', 'data-field': 'exposures.totals.new'},
            groupFooterAttributes: { 'class': 'numeric exposure all-prods new', 'data-field': 'exposures.totals.new' },
            exposureField: 'New',
            width: allocSheetCellWidths.exposures.totals['new']
    });
    console.timeEnd('Adding exposure totals cur and exposures total new');
	var totalHeaderData = { testSection: 'total', title: 'SS Comp', min: 0, max: _dates.length - 1, 'default': 0 };
    columns.push({
    	title: totalHeaderData.title,
        section: 'total',
    	headerTemplate: monthSliderTemplate(totalHeaderData),
    	headerAttributes: { 'data-header-section': 'total' },
    	columns: totalCols
    });

    columns = columns.concat(getLiquidityTermsColumns());

    return columns;
}

function getDateColumns(product, firstProd) {

    var columns = [],
        newAttributes = { 'class': 'section-separator numeric alloc-val new markedForQtip ', 'data-product': product, 'data-field': product + '.New', 'data-position-at':  'top-right', 'data-position-my': 'bottom-left'},
        newGroupFooterTemplate = getNewFooterTemplate(product);
        //newFooterTemplate = getNewFooterTemplate(product, 'n1');
    for (var i = 0; i < _dates.length; i++) {
        var col = getDateCol(product, _dates[i], firstProd);
      
        columns.push(col);
    }
    newAttributes['title'] = '#= getNewTitle("' + product + '")(data) #';
    newAttributes['class'] += '#= getNewTitle("' + product + '")(data).length > 6 ? "simple-qtip" : "" #';
    //newAttributes['style'] = '#= parseFloat(getNewTemplate("' + product + '")(data)) < 0 ? "color:red;" : "" #';
    columns.push({
        field: product + '.New',
        editor: readOnlyEditor,
        title: getNewColumnName(),
        aggregates: ['sum'],
        template: getNewTemplate(product),
        groupFooterTemplate: newGroupFooterTemplate,
        attributes: newAttributes,
        footerAttributes: newAttributes,
        groupFooterAttributes: newAttributes,
        width: allocSheetCellWidths.allocations.new
    });
    return columns;
}

function test(data, field) {
	if (!data[field]) { //debugger;
	}
	return data[field].sum;
}

function getDateCol(product, date, firstProd) {
	
    var cellClasses = ['numeric', 'alloc-val', '#= data.StrategyName == "Statistics" ? "stats-section" : "" #', '#= data.StrategyName == "SHORT TERM INVESTMENTS & LIQUIDITY" ? "liquidity-section" : "" #'],
        //allocAttributes = { 'data-product': product, 'title':'#= getApproachingColoring(data) #',  'data-month': date },
    	allocAttributes = { 'data-product': product, 'data-month': date },
        month = _dates.indexOf(date),
        field;
    if (month === 0) {
    	field = product + '.' + date + '.EndBalance';
    	allocAttributes.title = '#= getNAVTitle(data, "' + product + '", "' + date + '") || getOverflowTooltip(data, "' + product + '", "' + date + '") #';
    	
    	allocAttributes['data-field'] = field;
    	allocAttributes['data-position-at'] = 'top-right';
    	allocAttributes['data-position-my'] = 'bottom-left';
    	cellClasses.push('#= getNAVTitle(data, "' + product + '", "' + date + '") ? "simple-qtip" : "" #');
        cellClasses.push('cur');

        if (!firstProd) {
            cellClasses.push('section-separator');
        }
        allocAttributes['class'] = cellClasses.join(' ');
        allocAttributes['style'] = '#= apsAnchorCalcs.calculate(data.measure, data, "' + product + '.' + date + '.EndBalance") < 0 ? "color:red;" : "" #';
        allocFooterAttributes = Object.assign({}, allocAttributes);
        allocFooterAttributes['style'] = '#= data["' + field + '"].sum < 0 ? "color:red;" : "" #';
        var col = {
            field: product + '.' + date + '.EndBalance',
            editor: readOnlyEditor,
            title: 'Cur',
            template: function (e) {
            	if (!hasCurColumnValue(e)) { return ''; }
                var rawValue = e[product][date].EndBalance;
                
                if (e.StrategyName == 'Statistics' || e.StrategyName == "SHORT TERM INVESTMENTS & LIQUIDITY") {
                	
                    rawValue = apsAnchorCalcs.calculate(e.measure, e, product + '.' + date + '.EndBalance');
                 
                }
                var format = e.format || 'n1';
                return rawValue == null ? '&nbsp;'
                    : (rawValue < 0 && format.charAt(0) != 'p') ? '(' + kendo.toString(-1 * rawValue, format) + ')'
                    : rawValue === 0 ? kendo.toString(rawValue, format)
                    : kendo.toString(rawValue || '&nbsp;', format);
            },
            format: '{0:n1}',
            aggregates: ['sum'],
            groupFooterTemplate: function(e) {
            	if (!hasCurColumnFooter(e)){ return ''; }
            	return getSumTemplate(product, date)(e);
//            	var template = kendo.template(getSumTemplate());
//            	return template($.extend(true, {}, e, {sum: e[product+'.' +date+'.EndBalance'].sum}));            	
            }, 
            attributes: allocAttributes,
            footerAttributes: allocFooterAttributes,
            groupFooterAttributes: allocFooterAttributes,
            width: allocSheetCellWidths.allocations.cur
        };
    } else {
    	field = product + '.' + date + '.EndBalance';
        var hidden = false;
        if (month == 1) {
            cellClasses.push('section-separator');
        } else if (month > AllocationSheetGrid.settings.visibleMonths) {
            hidden = true;
        }
        var colName = product + '.' + date,
            allocWFAttributes = { 'data-product': product, 'data-month': date, 'data-position-at': 'top-right', 'data-position-my': 'bottom-left'};
    	allocAttributes['data-field'] = field;
    	allocWFAttributes['data-field'] = field;
        allocAttributes['class'] = cellClasses.join(' ') + '#= getCompositeWFAttribute(data, "' + colName + '", "class") #';
        allocAttributes['title'] = '#= getCompositeWFAttribute(data, "' + colName + '", "title") #';
        allocWFAttributes['class'] = cellClasses.join(' ') + ' wf-state-#= ' + colName + '.Status ? '  + colName + '.Status.toLowerCase() : "none" #';
        allocWFAttributes['title'] = '#= getWFStateTitle(data, "' + product + '", "' + date + '") || getOverflowTooltip(data, "' + product + '", "' + date + '") #';
        allocWFAttributes['style'] = '#= apsAnchorCalcs.calculate(data.measure, data, "' + colName + '.EndBalance") < 0 ? (data["'+ product +'"]["' + date + '"].SHOW_ZERO === 0) ? "color: rgb(255, 128, 128)" : "color: red;" : (data["'+ product +'"]["' + date + '"].SHOW_ZERO === 0 ? "color: Gray":"") #';
        allocWFAttributes['style'] += '#= isEditableCell(data, "' + product + '.' + date + '") ? "cursor: cell;" : "" #';
        allocAttributes['style'] = '#= getGroupFontColor(data, "'+ colName +'") #';
        
        var col = {
            field: field,
            //editor: navCustomEditor,
            title: kendo.toString(kendo.parseDate(date, '_yyyyMMdd'), 'MMM'),
            template: function (e) {
                var rawValue = e[product][date].EndBalance;
                if (e.StrategyName == 'Statistics' || e.StrategyName == "SHORT TERM INVESTMENTS & LIQUIDITY") {
                    rawValue = apsAnchorCalcs.calculate(e.measure, e, product + '.' + date + '.EndBalance', _aps_data);
                }
                var format = e.format || 'n1';
                var value = (rawValue == null) || ((e[product][date].SHOW_ZERO == 0) && (kendo.toString(rawValue, format) == '0.0')) ? '&nbsp;'
                    : (rawValue < 0 && format.charAt(0) != 'p') ? '(' + kendo.toString(-1 * rawValue, format) + ')'
                    : rawValue === 0 ? kendo.toString(rawValue, format)
                    : kendo.toString(rawValue || '&nbsp;', format);
                if (e.InvestmentName == 'P&L + Assumption Changes'){
                	if (window.VehicleFundingBase[product][date].EndBalance === 0){
                		value = '<span style="color:black;">' + kendo.toString(0, format) + '</span>';
                	}
                }
                var status = e[product][date].Status == null ? 'none'
                    : e[product][date].Status.toLowerCase();
                //var tickBtn = getTickButton(status);
                //var tickBtn = '';
                var cellMarker = (e[product][date].ALLOCATION_NOTES)
                	? '<span class="cell-comment" onclick="initCommentMarker(event, $(this))" onmouseover="initCommentMarker(event, $(this))"></span>' : '';
                return value + cellMarker;
            },
            format: '{0:n1}',
            aggregates: ['sum'],
            groupFooterTemplate: getSumTemplate(product, date),
            attributes: allocWFAttributes,
            headerAttributes: { 'class': 'alloc-val' },
            footerAttributes: allocAttributes,
            groupFooterAttributes: allocAttributes,
            hidden: hidden,
            width: allocSheetCellWidths.allocations.months
        };
    }
    return col;
}

function getLiquidityTermsColumns() {
	return [{
    	title: 'Next Liquidity Date',
    	section: 'liquidity-terms',
        headerAttributes: AllocationSheetGrid.headerAttributes.LIQUIDITY_TERMS,
    	columns: [{
            title: 'Next Notice Date',
            field: 'NEXT_NOTICE_DATE',
            template: AllocationSheetGrid.templates.NEXT_NOTICE_DATE,
            groupFooterTemplate: AllocationSheetGrid.templates.NEXT_NOTICE_DATE,
            attributes: AllocationSheetGrid.attributes.NEXT_NOTICE_DATE,
            groupFooterAttributes: AllocationSheetGrid.attributes.NEXT_NOTICE_DATE,
            footerAttributes: AllocationSheetGrid.attributes.NEXT_NOTICE_DATE,
            headerAttributes: AllocationSheetGrid.headerAttributes.NEXT_NOTICE_DATE,
            width: allocSheetCellWidths.NEXT_NOTICE_DATE
		},
		{
            title: 'Liquidity Month',
            field: 'LIQUIDITY_MONTH',
            template: AllocationSheetGrid.templates.LIQUIDITY_MONTH,
            groupFooterTemplate: AllocationSheetGrid.templates.LIQUIDITY_MONTH,
            attributes: AllocationSheetGrid.attributes.LIQUIDITY_MONTH,
            groupFooterAttributes: AllocationSheetGrid.attributes.LIQUIDITY_MONTH,
            footerAttributes: AllocationSheetGrid.attributes.LIQUIDITY_MONTH,
            headerAttributes: AllocationSheetGrid.headerAttributes.LIQUIDITY_MONTH,
            width: allocSheetCellWidths.LIQUIDITY_MONTH
		}]
	}];
}

function getProdExpCols() {
    var columns = [];
    for (var i = 0; i < _product_ids.length; i++) {
        var curAttributes = { 'class': 'numeric exposure cur section-separator', 'data-product': _products[i], 'data-field': 'exposures.' + _products[i] + '.cur' },
            newAttributes = { 'class': 'numeric exposure new', 'data-product': _products[i], 'data-field': 'exposures.' + _products[i] + '.new' },
            curTemplate = getExposureTemplate(_products[i], _dates[0]),
            curFooterTemplate = getExposureFooterTemplate(_products[i], _dates[0]),
            newTemplate = getExposureTemplate(_products[i], 'new'),
            newFooterTemplate = getExposureFooterTemplate(_products[i], 'new'),
            monthSliderTemplate = kendo.template($('#month-slider-template').html()),
            headerData = { testSection: _products[i], title: prodAbbrevs[_product_ids[i]].replace(/SSALT/g, 'SS'), min: 1, max: _dates.length - 1, 'default': 1 },
            prodColumns = [];
        prodColumns.push({
                title: 'Cur',
                field: 'exposures.' + _products[i] + '.cur',
                template: curTemplate,
                groupFooterTemplate: curFooterTemplate,
                attributes: curAttributes,
                headerAttributes: curAttributes,
                footerAttributes: curAttributes,
                groupFooterAttributes: curAttributes,
                exposureField: _products[i] + '.Cur',
                width: 40
        });

        prodColumns = prodColumns.concat(getDateExpCols(_products[i]));

        columns.push({
        	section: _products[i],
            headerTemplate: monthSliderTemplate(headerData),
        	headerAttributes: { 'data-header-section': _products[i] },
        	columns: prodColumns
        });
    }
    return columns;
}

function getDateTotalsCols(product) {
    var columns = [],
        title,
        field = '{product}.{date}'.replace('{product}', product || 'totals'),
        cellClasses = ['numeric', 'totals'],
        cellWidth;
    if (product) {
        title = prodAbbrevs[_product_ids[_products.indexOf(product)]];
       
        cellWidth = allocSheetCellWidths.exposures.products;
    } else {
        title = 'Total %';
        cellClasses.push('all-prods');
        cellWidth = allocSheetCellWidths.totals;
    }
    for (var i = 1; i < _dates.length; i++) {
        var template = getTotalTemplate(product, _dates[i]),
            footerTemplate = getTotalFooterTemplate(product, _dates[i]),
            attributes = { 'class': cellClasses.join(' '), 'data-month': _dates[i] },
            hidden = [1, AllocationSheetGrid.settings.visibleMonths].indexOf(i) < 0 || (product == null);
        if (product) {
            attributes['data-product'] = product;
        }
        var _field = field.replace('{date}', _dates[i]);
        attributes['data-field'] = _field;
        columns.push({
                title: kendo.toString(kendo.parseDate(_dates[i], '_yyyyMMdd'), 'MMM'),
                field: _field,
                template: template,
                groupFooterTemplate: footerTemplate,
                attributes: attributes,
                headerAttributes: attributes,
                footerAttributes: attributes,
                groupFooterAttributes: attributes,
                editor: readOnlyEditor,
                hidden: hidden,
                exposureField: ((product || '') + '.' + _dates[i]).replace(/^\./g, ''),
                width: cellWidth
        });
    }

    return columns;
}

function getDateExpCols(product) {
    var columns = [],
        title,
        field = 'exposures.{product}.{date}'.replace('{product}', product || 'totals'),
        cellClasses = ['numeric', 'exposure'],
        cellWidth;
    if (product) {
        title = prodAbbrevs[_product_ids[_products.indexOf(product)]];
       
        cellWidth = allocSheetCellWidths.exposures.products;
    } else {
        title = 'Total %';
        cellClasses.push('all-prods');
        cellWidth = allocSheetCellWidths.exposures.totals.months;
    }
    for (var i = 1; i < _dates.length; i++) {
        var template = getExposureTemplate(product, _dates[i]),
            footerTemplate = getExposureFooterTemplate(product, _dates[i]),
            attributes = { 'class': cellClasses.join(' '), 'data-month': _dates[i] },
            hidden = [1, AllocationSheetGrid.settings.visibleMonths].indexOf(i) < 0 || (product == null);
        if (product) {
            attributes['data-product'] = product;
        }
        var _field = field.replace('{date}', _dates[i]);
        attributes['data-field'] = _field;
        columns.push({
                title: kendo.toString(kendo.parseDate(_dates[i], '_yyyyMMdd'), 'MMM'),
                field: _field,
                template: template,
                groupFooterTemplate: footerTemplate,
                attributes: attributes,
                headerAttributes: attributes,
                footerAttributes: attributes,
                groupFooterAttributes: attributes,
                editor: readOnlyEditor,
                hidden: hidden,
                exposureField: ((product || '') + '.' + _dates[i]).replace(/^\./g, ''),
                width: cellWidth
        });
    }

    return columns;
}

function getSSIFTest2Columns() {
	var field = 'ssifTest2.cur',
		attributes = { 'class': 'section-separator cur tests-column ssif-test-2' + " #= getSsifTest2ColorClass(data, '" + _dates[0] + "') #", 'data-month': _dates[0], 'data-field': field },
		headerAttributes = { 'class': 'tests-column ssif-test-2' };
	var columns = [{
         title: 'Cur',
         field: field,
         template: getSSIFTest2Template(_dates[0]),
         groupFooterTemplate: getSSIFTest2FooterTemplate(_dates[0]),
         attributes: attributes,
         headerAttributes: headerAttributes,
         footerAttributes: attributes,
         groupFooterAttributes: attributes,
         width: allocSheetCellWidths.ssifTest2.cur,
         hidden: true
    }];
	for (var i = 1; i < _dates.length; i++) {
		field = 'ssifTest2.' + _dates[i];
		attributes = { 'class': 'tests-column ssif-test-2' + " #= getSsifTest2ColorClass(data, '" + _dates[i] + "') #" , 'data-month': _dates[i], 'data-field': field };
		headerAttributes = { 'class': 'tests-column ssif-test-2', 'data-month': _dates[i] };
		var date = kendo.parseDate(_dates[i], '_yyyyMMdd'),
			title = kendo.toString(date, 'MMM'),
            hidden = i !== 1;
		columns.push({
	         title: title,
	         field: field,
	         template: getSSIFTest2Template(_dates[i]),
	         groupFooterTemplate: getSSIFTest2FooterTemplate(_dates[i]),
	         attributes: attributes,
	         headerAttributes: headerAttributes,
	         footerAttributes: attributes,
	         groupFooterAttributes: attributes,
	         hidden: hidden,
	         width: allocSheetCellWidths.ssifTest2.months
	    });
	}
	field = 'ssifTest2.new';
	attributes = { 'class': 'tests-column ssif-test-2' + " #= getSsifTest2ColorClass(data, '" + _dates[AllocationSheetGrid.settings.visibleMonths] + "') #", 'data-field': field };
	headerAttributes = { 'class': 'tests-column ssif-test-2' };
    columns.push({
    	title: getNewColumnName(),
        field: field,
 		template: getSSIFTest2Template(_dates[_dates.length - 1]),
 		groupFooterTemplate: getSSIFTest2FooterTemplate(_dates[_dates.length - 1]),
 		attributes: attributes,
 		headerAttributes: headerAttributes,
 		footerAttributes: attributes,
 		groupFooterAttributes: attributes,
 		width: allocSheetCellWidths.ssifTest2['new'],
    });
    return columns;
}

function getCalculatedLiquidityTerms() {
	return APSDataService.get({
		svc_module: 'dal_service',
        svc_function: 'get_calculated_liquidity_terms',
        appcache: window.OFFLINE_ENABLED && { compressed: true }
	});
}

function getSumTemplate(product, date, gridFooter) {
	if (gridFooter) {
		return '#= sum < 0 ? "(" + kendo.toString(Math.round(-1 * sum), "n0") + ")" : sum >= 0 ? kendo.toString(Math.round(sum), "n0") : "" #';
	} else {
//		var caseString = "((data.StrategyName && data.StrategyName.groupField == 'StrategyName') || (data.StrategyName.groupValue && SHORT_TERM_STATS.some(function(s){return data.StrategyName.groupValue.indexOf(s) > -1})))";
//		return '#= (sum != null) && (' + caseString + '|| (kendo.toString(sum, "n1") != "0.0")) ? sum < 0 ? "(" + kendo.toString((' + caseString + ' ? Math.round(-1 * sum) : -1 * sum), (' + caseString + ' ? "n0" : "n1")) + ")"'+
//		': kendo.toString((' + caseString + ' ? Math.round(sum) : sum), (' + caseString + ' ? "n0" : "n1"))' +
//		': "" #';
	    var field = product + '.' + date;
	    var isCur = _dates.indexOf(date) == 0;
		return function(data){
		    var value = '';
		    var sum = data[field + '.EndBalance'].sum;
		    if (sum != null){
		        var isRounded = ((data.StrategyName && data.StrategyName.groupField == 'StrategyName') || (data.StrategyName.groupValue && SHORT_TERM_STATS.some(function(s){return data.StrategyName.groupValue.indexOf(s) > -1})));
	            var showZero = data[field + '.SHOW_ZERO'].max !== 0;

	            if (isRounded || showZero || kendo.toString(sum, "n1") != "0.0"){
	                var format = isRounded ? "n0" : "n1";
	                if (sum < 0){
	                    value = kendo.toString((isRounded ? Math.round(-1 * sum) : -1 * sum), format);
	                    value = `(${value})`;
	                } else {
	                    value = kendo.toString((isRounded ? Math.round(sum) : sum), format);
	                    
	                }
	            }
		    }
		    return value;
		}
	}
}

function getGroupFontColor(data, colName){
        var isStrategy = data.StrategyName && data.StrategyName.groupField == 'StrategyName',
            sum = data[colName + '.EndBalance'].sum,
            isOtherValue = !isStrategy && data[colName + ".SHOW_ZERO"].max === 0,
            fontColor = '';
        if (sum < 0){
            if (isOtherValue){
                fontColor = 'color: #ff8080';
            } else {
                fontColor = 'color: red';
            }
        } else {
            if (isOtherValue){
                fontColor = 'color: #808080';
            }
        }
        return fontColor;
}

//'#= data["' + colName + '.EndBalance"].sum < 0 ? (data["' + colName + '.SHOW_ZERO"].max === 0 ? "color:rgba(255,0,0,0.4)" : "color:red;") : (data["' + colName + '.SHOW_ZERO"].max === 0 ? "color: rgba(0,0,0,0.4)" : "") #';

function getCurSSCompositeME(data){
	
	if(data.FUND_TYPE == 'FUND'){
		return null;
	}
	var total = 0;
	for (var i = 0; i < _products.length; i++) {
        var nav = data[_products[i]][_dates[0]];
        if(nav.EQUITY_NAV){
        	total += nav.EQUITY_NAV;
        }
    }
	if(total === 0 ){
		return null;
	}
	else{
		return total;
	}
}


function getNewSSCompositeME(data){
	if(data.FUND_TYPE == 'FUND'){
		return null;
	}
	var managerEquity,
		leverageFactor,
		mioEquity = 0;
    for (var i in _products) {
        for (var j in _dates) {
        	mioEquity += data[_products[i]][_dates[j]].EndBalance;
        	if (data[_products[i]][_dates[j]].LEVERAGE_FACTOR){
        		leverageFactor = data[_products[i]][_dates[j]].LEVERAGE_FACTOR;
        	}
        }
    }
    
    if (mioEquity && leverageFactor){
    	managerEquity = (mioEquity * leverageFactor);
    	return managerEquity;
    }
    return '';    
}

function getNewSSCompositeTitle(data, value){
	if(data.FUND_TYPE == 'FUND'){
		return null;
	}
	var LEV_FACTOR = 0;
	var hasEquity = 0;
	var temp = '';
	var total = 0;
	var ret;
	
	for (var i = 0; i < _products.length; i++) {

        for (var j = 0; j < _dates.length; j++) {

            temp = (data[_products[i]][_dates[j]].EQUITY_NAV + (data[_products[i]][_dates[j]].EndBalance * data[_products[i]][_dates[j]].LEVERAGE_FACTOR));
            if(data[_products[i]][_dates[j]].LEVERAGE_FACTOR){
            	LEV_FACTOR = data[_products[i]][_dates[j]].LEVERAGE_FACTOR;
            }
            if(data[_products[i]][_dates[j]].EQUITY_NAV){
            	hasEquity = data[_products[i]][_dates[j]].EQUITY_NAV;
            }
            if(temp && temp !== 0){
            	 total += temp;
            }
        }
    }
	if(!LEV_FACTOR && hasEquity){
		//so if there is manager equity but no leverage factor for an allocation
		ret = 'Leverage factor unavailable, cannot compute total.';
	}

	else if(total !== 0 && total ){
		
		total = total.toFixed(3);

		var ret_val = value * LEV_FACTOR;

		ret_val = ret_val.toFixed(3);
		
		ret = 'Manager Equity: ' + ret_val;

	}
	
	if(ret){
		return encodeAsHtml(ret);
	}
	
}


function updateStatus($td, targetStatus, e) {
    if (targetStatus == null) {
        e = $td;
        $td = $(this).parents('td');
        targetStatus = $(this).attr('data-state');
    }
    var dataItem = $('#grid').data('kendoGrid').dataItem($td.parent('tr')),
        product = $td.attr('data-product'),
        date = $td.attr('data-month'),
        allocation = dataItem[product][date];
    var data = {
        originalValue: allocation.ALLOCATION_VALUE,
        originalStatus: allocation.Status,
        oldModifiedDate: allocation.MODIFIED_DATE,
        newModifiedDate: kendo.toString(new Date(), 'yyyy-MM-ddTHH:mm:ss.fff'),
        StrategyId: dataItem.StrategyId,
        InvestmentId: dataItem.InvestmentId,
        ProductId: allocation.ProductId || dataItem[product][_dates[0]].ProductId || parseInt(_product_ids[_products.indexOf(product)]),
        Date: date,
        updatedValue: allocation.ALLOCATION_VALUE,
        targetStatus: targetStatus,
        AllocationId: allocation.AllocationId,
        AllocationValueId: allocation.AllocationValueId,
        ALLOCATION_PERCENT: allocation.AllocationPercent,
        AS_OF_NAV: dataItem[product][_dates[0]].EndBalance * 1000000,
        ALLOCATION_NOTES: allocation.ALLOCATION_NOTES,
        IS_PLACEHOLDER: dataItem.IS_PLACEHOLDER,
        NextNoticeDate: allocation.NEXT_NOTICE_DATE,
        kuid: dataItem.uid,
        changeField: 'ACTION'
    };
    var column = product + '.' + date;
    if (e) {
        e.stopPropagation();
    }
    if (data.targetStatus == 'CANCELLED') {
        cancelAllocation(data, $td, column);
    } else {
        updateGrid(data, $td, column);
    }
}

function cancelAllocation(data, container, column) {
    /** Intercepts update to confirm user wants to cancel allocation */

	if (!data.originalStatus || data.originalStatus == 'CANCELLED') {
		toastAlert("The selected allocation cannot be cancelled as it hasn't entered into workflow.", null, 'warning');
		container.find('input').trigger('focusout');
		return;
	}
	if (data.originalStatus.indexOf('AMD_') >= 0) {
        toastAlert("The selected allocation cannot be cancelled since it is in the amendment workflow.", null, 'warning');
        container.find('input').trigger('focusout');
        return;
    }
    data.targetStatus = 'CANCELLED';
    data.AS_OF_NAV = data['AS_OF_NAV'];
    data.ALLOCATION_PERCENT = data['ALLOCATION_PERCENT'];

    var kendoWindow = $('<div style="width: 200px" />').kendoWindow({
        title: "Cancel Allocation",
        resizable: false,
        modal: true
    });

    kendoWindow.data("kendoWindow")
        .content($("#delete-confirmation").html())
        .center().open();

    kendoWindow.find(".delete-confirm,.delete-cancel")
        .click(function () {
            if ($(this).hasClass("delete-confirm")) {
            	container.text('0');
                updateGrid(data, container, column);
            }
            kendoWindow.data("kendoWindow").close();
        }).end();
}

function calculateProjectedBalance(dataItem, product, date) {
    var projectedBal = 0;
    for (var i = 0; i < _dates.indexOf(date) ; i++) {
        projectedBal += dataItem[product][_dates[i]].EndBalance || 0;
    }
    return projectedBal * dataItem[product][date].AllocationPercent * 10000;
}

function customNavCustomEditor(container, value, originalHtml) {
	var options = Object.assign({}, container[0].dataset);
	options.model = $('#grid').getKendoGrid().dataItem(container.parent('tr'));
    var date = options.field.split('.')[1],
        product = options.field.split('.')[0],
        allocation = options.model[product][date],
        oldModifiedDate = allocation.MODIFIED_DATE,
        newModifiedDate = kendo.toString(new Date(), 'yyyy-MM-ddTHH:mm:ss.fff');
    if (!isEditableCell(options.model, options.field)) {
        $('#grid').data('kendoGrid').closeCell();
        return;
    }
    var $textbox = $('<input class=>');
    var placeholder = allocation.AllocationPercent ? allocation.AllocationPercent + '%' : allocation.EndBalance;
    $textbox.attr('placeholder', placeholder);
    $textbox.attr('value', value);
    var originalHtml = originalHtml || container.html();
    container.html($textbox);
    var inputbox = container.find('input');
    inputbox.click(function(e){e.stopPropagation();});
    inputbox.focus();
    inputbox.focusout(function(){
    	$(this).remove();
    	container.html(originalHtml);
    });
    inputbox.height(container.height() - 10);
    var nav = options.model[product][_dates[0]];
    var productId = allocation.AllocationId ? allocation.ProductId : nav.EndBalance ? nav.ProductId : parseInt(_product_ids[_products.indexOf(product)]);
    var data = {
        originalValue: allocation.ALLOCATION_VALUE,
        originalStatus: allocation.Status,
        StrategyId: options.model.StrategyId,
        InvestmentId: options.model.InvestmentId,
        ProductId: productId,
        Date: date,
        targetStatus: allocation.Status || 'DRAFT',
        AllocationId: allocation.AllocationId,
        AllocationValueId: allocation.AllocationValueId,
        oldModifiedDate: oldModifiedDate,
        newModifiedDate: newModifiedDate,
        NextNoticeDate: allocation.NEXT_NOTICE_DATE,
        ALLOCATION_NOTES: allocation.ALLOCATION_NOTES,
        IS_PLACEHOLDER: options.model.IS_PLACEHOLDER,
	    kuid: options.model.uid,
	    changeField: 'ALLOCATION_VALUE'
    };
    
    $textbox.keypress(function (e) {
        if (e.which == 13) {
        	$textbox.unbind('keypress');
        	if ($(this).val() === ""){
        		var placeholder = e.currentTarget.getAttribute('placeholder');
        		if (placeholder){
        			$(this).parent().text(kendo.toString(parseFloat(placeholder), 'n1'));
        		}
        		$(this).parent().removeAttr('data-role');
        		$(this).remove();
        		return;
        	}
            var rawInput = $(this).val().trim(),
                dataItem = $('#grid').data('kendoGrid').dataItem($(this).parents('tr'));
            if (!/^[.-]*[0-9]+[%.]?[0-9]*$/.test(rawInput)){
                toastAlert(`Allocation must be valid numeric value, you entered "${rawInput}"`, `User entered "${rawInput}"`, 'warning');
                return customNavCustomEditor(container, rawInput, originalHtml);
            }
            data.AS_OF_NAV = dataItem[product][_dates[0]].EndBalance * 1000000;
            dataItem[product][date].AsOfNav = dataItem[product][_dates[0]].EndBalance;
            if (rawInput.search('%') == rawInput.length - 1) {
                data.ALLOCATION_PERCENT = parseFloat(rawInput);
                dataItem[product][date].AllocationPercent = data.ALLOCATION_PERCENT;
                data.updatedValue = calculateProjectedBalance(dataItem, product, date);
            } else {
                data.updatedValue = rawInput * 1000000;
                data.ALLOCATION_PERCENT = null;
            }
            if (isNaN(data.updatedValue) || (data.updatedValue > 10**10)){
                toastAlert(`Allocation must be valid value, you entered "${rawInput}"`, `User entered "${rawInput}"`, 'warning');
                return customNavCustomEditor(container, rawInput, originalHtml);
            }
            var column = product + '.' + date;
            if (data.updatedValue === 0) {
            	cancelCell(container);
            } else {
                updateGrid(data, container, column);
            }
        }
    });
}

function readOnlyEditor(container, options) {
    //necessary for fields which are dynamic and nested => can't be added to schema to specify "editable: false"
    $('#grid').data('kendoGrid').closeCell();
}

function getGridData(){
	var gridData = $('#grid').data('kendoGrid').dataSource.data();
	
	
	//for(var i = 0; i < gridData.length; i++){if(gridData[i].GridSection === 'Statistics'){console.log(gridData[i]);}}
	return gridData;
}


function isEditableCell(dataItem, field) {
	if (AllocationSheetGrid.IS_READ_ONLY) {
		return false;
	}
	var fields = field.split('.'),
		product = fields[0],
		date = fields[1],
		status = dataItem[product][date].Status;
	return immutableStatuses.indexOf(status) < 0
		&& dataItem.StrategyName != 'Statistics'
		&& (dataItem.StrategyName != 'SHORT TERM INVESTMENTS' || !SHORT_TERM_STATS.some(function(e) { return dataItem.Composite.indexOf(e) >= 0; }))
		&& (['FUND', 'LP'].indexOf(dataItem.FUND_TYPE) >= 0 || !dataItem.IS_DEFAULT || dataItem.IS_PLACEHOLDER)
        && (kendo.parseDate(date, '_yyyyMMdd').getTime() > (new Date()).getTime() || AllocationSheetGrid.settings.ALLOW_PAST_EDIT);
}

function setKendoColumnHidden(column, isHidden) {
	var addedStyle = isHidden ? 'display: none;' : '';
	column.hidden = isHidden;
	column.footerAttributes.style = addedStyle + (column.footerAttributes.style || '').replace(/display:\s*none;?/g, '');
	column.attributes.style = addedStyle + (column.attributes.style || '').replace(/display:\s*none;?/g, '');
}

function showMonths(number, product) {
	console.log('show months');
	colDimensionsEdited = true;

    if (number < 0 || number > _dates.length - 1) {
        return;
    }

    var toHide = [],
    	toShow = [],
        exposureFieldsToHide = [],
        exposureFieldsToShow = [],
    	products = product ? [product] : _products;
        //colSelector = (product == null) ? 'td.alloc-val' : `td.alloc-val[data-product="${product}"]`;

    for (var i in products) {
    	var visibleMonths = $(`th[data-prodname="${products[i]}"]`).data('visibleMonths'),
    		hide = (number < visibleMonths),
    		low = (hide ? number : visibleMonths) + 1,
    		high = hide ? visibleMonths : number,
    		addList = hide ? toHide : toShow,
    		columnGroup = $('#grid').data('kendoGrid').columns.filter(e => e.title === products[i])[0];

	    for (var j = low; j <= high; j++) {
	    	var curCol = columnGroup.columns[j];
	    	addList.push(`td.alloc-val[data-product="${products[i]}"][data-month="${_dates[j]}"]`);
	    	setKendoColumnHidden(curCol, hide);
	    }

	    var $productHeader = $(`th[data-prodname="${products[i]}"]`);
	    $productHeader.attr('colspan', number + 2);
	    $productHeader.data('visibleMonths', number);

        var visibleExposureMonths = $(`#grid [data-header-section="${products[i]}"]`).data('visibleMonths');
        if (!product && visibleExposureMonths < number) {
            var hideDate = _dates[visibleMonths],
                showDate = _dates[number];
            exposureFieldsToHide.push(`exposures.${products[i]}.${hideDate}`);
            exposureFieldsToShow.push(`exposures.${products[i]}.${showDate}`);
        }    
    }

    if (exposureFieldsToHide.length) {
        showGridColumns(exposureFieldsToHide, false);
    }
    if (exposureFieldsToShow.length) {
        showGridColumns(exposureFieldsToShow, true);
    }

    $('#grid .k-grid-header-wrap th.alloc-val').each(function () {
        var $header = $(this),
            headerField = $header.attr('data-field').split('.');
        if (headerField.length === 0) {
            return true;
        }
        var headerProd = headerField[0],
            headerMonth = _dates.indexOf(headerField[1]);
        if (headerMonth > number) {
            if (product == null || product == headerProd) {
                $header.hide();
            }
        } else if (product == null || product == headerProd) {
            $header.show();
        }
    });

    $(toShow.join(',')).show();
    $(toHide.join(',')).hide(); 

    adjustColspan($('#grid'));
	resizeColumns();

    showAnchorGridMonths(number, product);

    if (!product) {
        AllocationSheetGrid.settings.visibleMonths = number;
        var refreshFields = _products.map(e => `${e}.New`);
        $('#grid .k-grid-content tr').refreshRows(refreshFields);
    }

    console.log('Updating shown columns from shown test months...');
    UIFixerUpper.updateShownProductWidths(true);
}

function showTestMonths(number, section) {
	colDimensionsEdited = true;

	var visibleMonths = $(`#grid [data-header-section="${section}"]`).data('visibleMonths'),
        show = visibleMonths < number,
        lastDate = _dates[AllocationSheetGrid.settings.visibleMonths],
        dates, fields;
    if (show) {
        dates = _dates.slice(visibleMonths + 1, number + 1);
    } else {
        dates = _dates.slice(number + 1, visibleMonths + 1);
    }
    if (_products.indexOf(section) >= 0) {
        if (show && dates.indexOf(lastDate) < 0) {
            dates.push(lastDate);
        } else if (dates.indexOf(lastDate) >= 0) {
            dates = dates.filter(date => date !== lastDate);
        }
    }
    if (section === 'total') {
        fields = dates.map(date => `exposures.totals.${date}`);
    } else if (section === 'exposure') {
        fields = dates.map(date => `totals.${date}`);
    } else if (section === 'ssiftest2') {
        fields = dates.map(date => `ssifTest2.${date}`);
    } else {
        fields = dates.map(date => `exposures.${section}.${date}`);
    }
    showGridColumns(fields, show);
    $(`#grid th[data-header-section="${section}"]`).data('visibleMonths', number);
}

function getFlattenedGridColumns() {
    var columns = [];
    $('#grid').data('kendoGrid').columns.forEach(column => {
        if (column.columns) {
            columns = columns.concat(column.columns.map(col => {
                col.section = column.section;
                return col;
            }));
        } else {
            columns.push(column);
        }
    });
    return columns;
}

function showGridColumns(fields, show) {
    var selector = fields.map(field => `#grid [data-field="${field}"]`).join(','),
        method = show ? 'show' : 'hide',
        columns = getFlattenedGridColumns(),
        anchorGrid = $('#totals-grid').data('kendoGrid'),
        sections = Array.from(new Set(columns.filter(column => fields.indexOf(column.field) >= 0).map(column => column.section)));
    $(selector)[method]();
    fields.forEach(field => {
        var column = columns.filter(col => col.field === field)[0];
        setKendoColumnHidden(column, !show);
        anchorGrid[`${method}Column`](field);
    });
    sections.forEach(section => {
        var colspan = columns.filter(column => column.section === section && !column.hidden).length,
            $header = $(`#grid [data-header-section="${section}"]`);
        if (colspan) {
            $header.show();
        } else {
            $header.hide();
        }
        $header.attr('colspan', colspan);
    });
    resizeColumns();
    adjustColspan($('#grid'));
}

function setLastSize(){
	
	var w = $('#totals-grid .k-grid-content colgroup > col:last').width();
	w += $('#grid .k-grid-content table').width() - $('#totals-grid .k-grid-content table').width();
	w+= 15;
	$('#totals-grid .k-grid-content colgroup > col:last').width(w); 
	
}

function adjustAnchorCellsToGrid() {
	console.log('entering adjust anchor cells');
	var topGridRows = $('[class="k-grid-content k-auto-scrollable"]:eq(0)').find('tr:eq(2)').find('td'); //first from main
	//var botGridRows = $('[class="k-grid-content k-auto-scrollable"]:eq(1)').find('tr'); //4 from anchor
	
	var total = 0;
	//var newWidths = [];
	//var curWidth = 0;
	for(var i in topGridRows){
		
		if(!isNaN(topGridRows[i].clientWidth) ){
			if(topGridRows[i].clientWidth!==0 ){
				total++;
			}
			
		}
	}
	
	if(!testsHidden){ //-1 for the padding
		$('[class="k-grid-content k-auto-scrollable"]:eq(1) > table').width( $('[class="k-grid-content k-auto-scrollable"]:eq(1) > table').width() + (total * 5) );
	}
	else if(testsHidden){
		$('[class="k-grid-content k-auto-scrollable"]:eq(1) > table').width( $('[class="k-grid-content k-auto-scrollable"]:eq(1) > table').width() - (total * 5) );
	}
	
	testsHidden = !testsHidden;
	//return total;
	
	
}

function resizeColumns() {
    var flatColumns = flattened($('#grid').data('kendoGrid').columns, 'columns'),
        visibleNonLockedColumns = flatColumns.filter(e => !(e.hidden || e.locked)),
        widths = visibleNonLockedColumns.map(e => e.width),
        totalWidth = widths.reduce((a, b) => a + b),
        colgroupHtml = widths.map(e => `<col style="width:${e}px;">`).join('');

    $('#grid .k-grid-header-wrap colgroup').html(colgroupHtml);
    $('#grid .k-grid-header-wrap table').width(totalWidth);

    $('#grid .k-grid-content colgroup').html(colgroupHtml);
    $('#grid .k-grid-content table').width(totalWidth);

    $('#grid .k-grid-footer-wrap colgroup').html(colgroupHtml);
    $('#grid .k-grid-footer-wrap table').width(totalWidth);
}
resizeColumns = mioUtils.timed(resizeColumns);

function hideGroupCols() {
    var g = $('#grid').data('kendoGrid');
    for (var i = 0; i < g.columns.length; i++) {
        g.showColumn(i);
    }
    $('div.k-group-indicator').each(function (i, v) {
        g.hideColumn($(v).data('field'));
    });
}
function bindScrollBarsAPS($other, options) {
	console.log('binding in bindScrollBars');
	var $this = this;
	options = options || { vertical: true, horizontal: true };
	if (options.vertical) {
		$this.scroll(function () { $other.scrollTop($this.scrollTop()); });
		$other.scroll(function () { $this.scrollTop($other.scrollTop()); });
	}
	if (options.horizontal) {
		$this.scroll(function () { $other.scrollLeft($this.scrollLeft()); });
		$other.scroll(function () { $this.scrollLeft($other.scrollLeft()); });
	}
}

function getStatusFilters(states) {
    var filters = [];
    if (typeof states == 'string') { states = [states]; }
    for (var i = 0; i < _products.length; i++) {
        var months = parseInt($('.k-grid-header-wrap th[data-prodname="' + _products[i] + '"]').attr('colspan')) - 1;
        for (var j = 0; j < months; j++) {
        	for (var k in states) {
	            filters.push({
	                field: _products[i] + '.' + _dates[j] + '.Status',
	                operator: 'eq',
	                value: states[k]
	            });
        	}
        }
    }
    return filters;
}

function getTickButton(status) {
    if (status == 'draft') {
        return '<a href="#"><i class="k-icon k-i-tick" title="Submit" data-state="SUBMITTED"></i></a>'
            + '<a href="#"><i class="k-icon k-i-close cancel-allocation" title="Cancel" data-state="CANCELLED"></i></a>';
    } else {
        return '';
    }
}

//replaces all header html with footer html (call with no params)
function footersToHeaders() {
	
	console.time('footersToHeaders');
	
  var $rows = $('#grid .k-grid-content').find('.k-grouping-row,.k-group-footer');
      //$lockedHeaders = $('#grid .k-grid-content-locked').find('.k-grouping-row');
  $('#grid .k-grid-content-locked').find('span[data-group-field]').each(function (i) {
      var groupField = $(this).attr('data-group-field'),
      	groupValue = $(this).attr('data-group-value');
      $(this).parents('tr').attr('data-group-field', groupField);
      $(this).parents('tr').attr('data-group-value', groupValue);
      $($rows[i]).attr('data-group-field', groupField);
      $($rows[i]).attr('data-group-value', groupValue);
  });
 
  
  
  //var x = 0;
 
  $('#grid .k-grid-content').find('.k-grouping-row:not([data-group-field="GridSection"]):not([data-group-value="Measure"]):not([data-group-field="StrategyName"])').each(function (i) { //for every row
     
	  var groupField = $(this).attr('data-group-field'); //quick
	
     
      
      //console.time('footers to headers main');
      $(this).html($(this).nextAll('.k-group-footer[data-group-field="' + groupField + '"]:first').html()); //this guy takes ~1.9 secs
      
      //console.log( $(this).html($(this).nextAll('.k-group-footer[data-group-field="' + groupField + '"]:first').html()));
      
      
      //console.timeEnd('footers to headers main');
     
  });
  
  	console.timeEnd('footersToHeaders');
  
}

function initRowAttributes() {
  $('#grid .k-grid-content').find('tr[role="row"]').each(function () {
      $(this).attr('data-mgr-type', $(this).find('td.mgr-type').text());
  });
}

function setRowCalcTypes() {
  var calc = $('input[name="nav-type"]:checked').parent('label').text().toLowerCase();
  
  $('#grid .k-grid-content [role="row"]').each(function () {
      var dataItem = $('#grid').data('kendoGrid').dataItem($(this));
      dataItem.Calc = (calc == 'Blended') ? dataItem.MgrType.toLowerCase() : calc;
  });
}

function revertColsBeforeDatabound(){
	if(colDimensionsEdited){
		$('#grid.k-grid-content-locked > table > tbody > tr:nth-last-child(4)').attr('role','formatter');
		
		
		for(var i in _products){
			console.log('hiding from delete manager... ' + _products[i]);
			showMonths(3, _products[i]);
			showTestMonths(0, _products[i]);
		}
		//$('#totals-slide-in-handle').trigger('click');
		//$('#totals-slide-in-handle').trigger('click');
		
		
		/*
		setTimeout(function(){
			
			
			$('#totals-slide-in-handle').trigger('click');
			
			//$('[oldtitle="The % of assets that could be liquidated in 3 months as calculated by the liquidity model"]').attr('role','formatter');
			//ThreeToOne();
			
			for(i in _products){
				console.log('hiding from delete manager... ' + _products[i]);
				showMonths(3, _products[i]);
				showTestMonths(0, _products[i]);
			}
			
		}, 100);
		*/
			
	}
	
}

function deleteManager(id, entityType, managerType) {
	/**
	 * delete dummy/clone managers
	 */
	
	if(investmentResized){
		console.log('Trying to delete with investments resized, this is the error state...');
	}
	
	var data = {},
		svcFunc = 'delete_{0}_manager'.formatStr([managerType]);
	data[entityType + '_id'] = id;
	return APSDataService.post({
	    svc_module: 'dal_service',
	    svc_function: svcFunc,
	    data: data
	});
}

function deleteAllocationValue(id) {
	return APSDataService.post({
		svc_module: 'dal_service',
		svc_function: 'delete_allocation_value',
		data: {
			allocation_value_id: id
		}
	});
}

function saveGridSorting(sortedComposites, name) {
	var viewJson = JSON.stringify(sortedComposites);
    return APSDataService.post({
        svc_module: 'grid_view_service',
        svc_function: 'save_grid_view',
        data: {
            grid_view_name: name,
            view_json: viewJson,
            grid: 'APS_AllocationSheet_Sort',
            is_default: true
        }
    });
}

function updateTotals(grid, dataItem, field, difference, current) {
    var updatedFields = getUpdatedFields(field),
    	viewIndex = dataItem.GridSection == 'Allocations' ? 0 : 1,
        view = grid.dataSource.view(),
        allocationsGroup = view[viewIndex],
        strategyGroup = $.grep(allocationsGroup.items, function (e) { return e.value == dataItem.StrategyGroup; })[0],
        compositeGroup = $.grep(strategyGroup.items, function (e) { return e.value == dataItem.CompositeGroup; })[0],
        $row = $('#grid > .k-grid-content > table > tbody').children('tr[data-uid="' + dataItem.uid + '"]'),
        $strategyRow = $row.nextAll('tr[data-group-field="StrategyName"]').eq(0),
        $compositeRow = $row.prevAll('tr[data-group-field="CompositeGroup"]').eq(0);
    if (difference){
    	var futureFields = current ? [] : updateFutureFields(field, dataItem, [allocationsGroup, strategyGroup, compositeGroup], difference);
        updatedFields = updatedFields.concat(futureFields);
        allocationsGroup.aggregates[field].sum = (difference + allocationsGroup.aggregates[field].sum) || null;
        strategyGroup.aggregates[field].sum = (difference + strategyGroup.aggregates[field].sum) || null;
        compositeGroup.aggregates[field].sum = (difference + compositeGroup.aggregates[field].sum) || null;
    }
    if (!current) {
    	updateSSIFTest2(field, dataItem, [allocationsGroup, strategyGroup, compositeGroup]);
    }
    $row.refreshRows(updatedFields, dataItem);
    updatedFields.push(field);
    $strategyRow.refreshRows(updatedFields, strategyGroup);
    $compositeRow.refreshRows(updatedFields, compositeGroup);
}

function getUpdatedFields(field) {
    var splitField = field.split('.'),
        product = splitField[0],
        date = splitField[1],
        newField = product + '.New',
        month = _dates.indexOf(date),
        updatedFields = [newField, 'exposures.totals.new', 'ssifTest2.new', 'totals.new', 'totals.delta'];
    for (var i = month; i < _dates.length; i++) {
        updatedFields.push('exposures.' + product + '.' + _dates[i]);
        updatedFields.push('exposures.totals.' + _dates[i]);
        updatedFields.push('ssifTest2.' + _dates[i]);
    }
    for (var i in _products) {
        updatedFields.push('exposures.' + _products[i] + '.new');
    }
    return updatedFields;
}

function updateFutureFields(field, dataItem, aggregates, difference) {
    var splitField = field.split('.'),
	    product = splitField[0],
	    date = splitField[1],
	    month = _dates.indexOf(date),
	    updatedFields = [],
	    projectedNAV = 0;
	for (var i = 0; i < _dates.length; i++) {
		var pct = dataItem[product][_dates[i]].AllocationPercent,
			eb = dataItem[product][_dates[i]].EndBalance,
			val = pct ? ((pct / 100.0) * projectedNAV) : eb;
		if (i > month) {
			var calcDifference = val - dataItem[product][_dates[i]].EndBalance;
			dataItem[product][_dates[i]].EndBalance = val || null;
			var curField = '{0}.{1}.EndBalance'.formatStr([product, _dates[i]]);
			for (var j = 0; j < aggregates.length; j++) {
				var newSum = (aggregates[j].aggregates[curField].sum + calcDifference) || null;
				aggregates[j].aggregates[curField].sum = newSum;
			}
		    updatedFields.push(curField);
		}
		projectedNAV += val;
	}
	return updatedFields;
}

function updateSSIFTest2(field, dataItem, aggregates) {
    var splitField = field.split('.'),
	    product = splitField[0],
	    date = splitField[1],
	    month = _dates.indexOf(date),
	    ssifProducts = getSSIFTest2Products(),
	    css = ssifProducts[0],
	    ssif = ssifProducts[1],
		projectedCSS= 0,
		projectedSSIF= 0;
    if (!affectsSSIFTest2(product)) {
    	return;
    }
	for (var i = 0; i < _dates.length; i++) {
		projectedCSS += dataItem[css][_dates[i]].EndBalance * 1000000 / ANAV[_dates[i]].CSS;
		projectedSSIF += dataItem[ssif][_dates[i]].EndBalance * 1000000 / ANAV[_dates[i]].SSIF;
		if (i >= month) {
			var ssifTest2 = (projectedCSS && projectedSSIF) ? 0 : (projectedSSIF - projectedCSS);
			var unique = ssifTest2 > 0 ? 1 : ssifTest2 < 0 ? 2 : null;
			ssifTest2 = Math.abs(ssifTest2);
			var difference = ssifTest2 - dataItem.ssifTest2[_dates[i]].EndBalance || 0;	
				
				var uniques = [unique||0];
				var composites = shortTermCalcs.getComposites();
				var thisComposite = $.grep(composites, function(e){return e.value.indexOf(dataItem.Composite) > -1})[0];
				var items = thisComposite.items;
				for (var j in items){
					if (items[j].InvestmentId != dataItem.InvestmentId && items[j].ssifTest2[_dates[i]]['unique']){
						uniques.push(items[j].ssifTest2[_dates[i]]['unique']);
					}
				}
				uniques = uniques.filter(Boolean);
				var newUnique = uniques.reduce((a,b) => a+b, 0)/uniques.length || null;
				thisComposite.aggregates['ssifTest2.' + _dates[i] + '.unique'].average = newUnique;
				
			if (difference) {
				dataItem.ssifTest2[_dates[i]].EndBalance = ssifTest2;
				dataItem.ssifTest2[_dates[i]].unique = unique;
				var ssifField = 'ssifTest2.{0}.EndBalance'.formatStr([_dates[i]]);
				for (var j = 0; j < aggregates.length; j++) {
					aggregates[j].aggregates[ssifField].sum += difference;
				}
			}
		}
	}
}

function affectsSSIFTest2(product) {
	return getSSIFTest2Products().indexOf(product) >= 0;
}

function getSSIFTest2Products() {
	var cssId = INV_PROD_ABBREVS.CSS,
		cssIdx = _product_ids.indexOf(cssId),
		css = _products[cssIdx],
		ssifId = INV_PROD_ABBREVS.SSIF,
		ssifIdx = _product_ids.indexOf(ssifId),
		ssif = _products[ssifIdx];
	return [css, ssif];
}

function getCalculatedStats(filter) {
    var $grid = $('#grid'),
        stats = $grid.data('kendoGrid').dataSource.view()[1].items[0].items[0].items,
        calcdStats = $.grep(stats, function (e) {
            return e.measure && apsAnchorCalcs['calculate' + e.measure];
        }),
        uids = $.map(calcdStats, function (e) { return e.uid; });
    if (filter) {
        return $grid.children('.k-grid-content').find('tr[data-uid="' + uids.join('"]' + filter + ',.k-grid-content tr[data-uid="') + '"]' + filter);
    } else {
        return $grid.children('.k-grid-content')
        			.children('table')
        			.children('tbody')
        			.children('tr[data-uid="' + uids.join('"]' + ',.k-grid-content tr[data-uid="') + '"]');
    }
}

function ssifTest1Template(dataItem) {
	if (!hasSSIFTest(dataItem)) {
		return '';
	}
	var retVal = dataItem.ssifTest1;
	return kendo.toString(filterNaN(retVal), 'p1');
}

function ssifTest1FooterTemplate(dataItem) {
	if (!hasSSIFTestFooter(dataItem)) {
		return '';
	}
	var retVal = dataItem.ssifTest1 && dataItem.ssifTest1.sum;
	return kendo.toString(filterNaN(retVal), 'p1');
}

function getSSIFTest2Template(date) {
	return function (dataItem) {
		if (!hasSSIFTest(dataItem)) {
			return kendo.toString(0, 'p1');;
		}
        var month = date;
        if (date == 'new') {
            month = _dates[AllocationSheetGrid.settings.visibleMonths];
        }
		var value = dataItem.ssifTest2 && dataItem.ssifTest2[month] && dataItem.ssifTest2[month].EndBalance;
		return kendo.toString(value || 0, 'p1');
	}
}

function getSSIFTest2FooterTemplate(date) {
	return function (dataItem) {
		if (!hasSSIFTestFooter(dataItem)) {
			return kendo.toString(0, 'p1');
		}
        var month = date;
        if (date == 'new') {
            month = _dates[AllocationSheetGrid.settings.visibleMonths];
        }
		var field = `ssifTest2.${month}.EndBalance`,
			value = dataItem[field] && dataItem[field].sum;

		return kendo.toString(value || 0, 'p1');
	};
}

function getNewValue(product){
	return function (e) {
    	if (!hasNewColumnValue(e)) { return ''; }
        var value = 0;
        var show = false;
        var prodId = getProductId(product);
        for (var i = 0; i < _dates.length; i++) {
            if (e[product][_dates[i]].EndBalance != null) {
                show = true;
                value += e[product][_dates[i]].EndBalance;
            }
        }
        return show ? value : '';
    };
}

function getNewColumnName(){
	return kendo.toString(kendo.parseDate(_dates[_dates.length - 1], "_yyyyMMdd"), "MMMyy");
}

function getNewTitle(product){
	return function (e) {
		value = getNewValue(product)(e);
    	if (!value) { return ''; }
        format = e.format || 'n1';
        value = kendo.toString(value, format);
        return value;
    }; 
}

function getNewTemplate(product){
	return function (e) {
		value = getNewValue(product)(e);
    	if (!value) { return ''; }
    	var color = 'black';
        format = e.format || 'n1';
        valueString = kendo.toString(Math.abs(value), format);
        if (value < 0){
        	valueString = '(' + valueString + ')';
            color = 'red';
        }
        return '<span style="color:' + color + '">'+valueString+'</span>';
    };
}

function getSSCompositeDelta(e) {
    if (!hasTotalsColumnValue(e, 'delta')){
      return '';
    }
    var tot = 0;
    if (["NAV_FORECAST", "AGAV_FORECAST", "ANAV_FORECAST"].indexOf(e.measure) > -1){
    	var cur = 0;
    	for (var i in _products){
    		cur += apsAnchorCalcs.calculate(e.measure, e, `${_products[i]}.${_dates[0]}.EndBalance`);
    		tot += apsAnchorCalcs.calculate(e.measure, e, `${_products[i]}.${_dates[_dates.length-1]}.EndBalance`);
    	}
    	tot = tot - cur;
    }else{
    	for (var i in _products) {
        	for (var j = 1; j < _dates.length; j++) {
                if (e[_products[i]]) {
                    tot += e[_products[i]][_dates[j]].EndBalance;
                } else {
                    tot += e[`${_products[i]}.${_dates[j]}.EndBalance`].sum;
                }
            }
        }
        
    }
    
    return tot;
}

function getSSCompositeCurExposuresTemplate(isAggregate) {
	return function (e) {
    	if (isAggregate && (!hasTotalsColumnFooter(e) || (e.StrategyName.groupValue && (SHORT_TERM_STATS.some(function(s){return e.StrategyName.groupValue.indexOf(s) > -1;}) && !(['VFN', 'Fund Level Cash'].indexOf(e.StrategyName.groupValue) > -1))))) {
            return '';
        } else if (!hasTotalsColumnValue(e) || e.StrategyName == 'SHORT TERM INVESTMENTS & LIQUIDITY') {
            return '';
        }
        var color = 'black';
        var tot = 0;
        for (var i=0; i < _products.length; i++){
            if (isAggregate) {
                tot += e[`${_products[i]}.${_dates[0]}.EndBalance`].sum;
            } else if (e.measure) {
                tot += apsAnchorCalcs.calculate(e.measure, e, `${_products[i]}.${_dates[0]}.EndBalance`);
            } else {
                tot += e[_products[i]][_dates[0]].EndBalance;
            }
        }
        var isStrategyGroup = (e.StrategyName && e.StrategyName.groupField == 'StrategyName'),
            format = isStrategyGroup ? 'n0' : 'n1';
        tot = isStrategyGroup ? Math.round(tot) : tot;
        var valueString = kendo.toString(Math.abs(tot), format);

        if (tot < 0){
          	valueString = '(' + valueString + ')';
            color = 'red';
        }
        return '<span style="color:' + color + '">'+valueString+'</span>';
    };
}

function getSSCompositeNewExposuresTemplate(isAggregate) {
	return function (e) {
    	if ((isAggregate && !hasTotalsColumnFooter(e)) || !hasTotalsColumnValue(e)) {
    		  return '';
    	}
    	var color = 'black';
        var tot = 0;
        if (e.StrategyName == 'Statistics'){
        	for (var i in _products) {
        		tot += apsAnchorCalcs.calculate(e.measure, e, _products[i] + '.' + _dates[_dates.length - 1] + '.EndBalance');
            }
        }
        else{
        	for (var i = 0; i < _products.length; i++) {
                for (var j = 0; j < _dates.length; j++) {
                    if (e.measure) {
                        tot = (tot||0) + apsAnchorCalcs.calculate(e.measure, e, `${_products[i]}.${_dates[j]}.EndBalance`);
                    } else if (e[_products[i]]) {
                        tot += e[_products[i]][_dates[j]].EndBalance;
                    } else {
                        tot += e[`${_products[i]}.${_dates[j]}.EndBalance`].sum;
                    }
                }
            }
        }
        var isStrategyGroup = (e.StrategyName && e.StrategyName.groupField == 'StrategyName'),
            format = isStrategyGroup ? 'n0' : 'n1';
        tot = isStrategyGroup ? Math.round(tot) : tot;
        valueString = kendo.toString(Math.abs(tot), format);
        if (tot < 0){
        	valueString = '(' + valueString + ')';
              color = 'red';
          }
          return '<span style="color:' + color + '">'+valueString+'</span>';
    }
}

function getNewFooterTemplate(product, format) {
    return function (sums) {
        if (sums.StrategyName.groupValue && !hasNewColumnFooter(sums)){
            return '';
        }
        if (sums.Composite && !hasNewColumnValue(sums)){
            return '';
        }
        var total = 0;
        var prodId = getProductId(product);
        for (var i = 0; i < _dates.length; i++) {
            total += sums[`${product}.${_dates[i]}.EndBalance`].sum || 0;
        }
        var isRounded = sums.StrategyName && (sums.StrategyName.groupField == 'StrategyName' || (sums.StrategyName.groupValue && SHORT_TERM_STATS.some(function(e) {return sums.StrategyName.groupValue.indexOf(e) >= 0 })));
        var format = format || (isRounded ? 'n0' : 'n1');
        var totalString =  kendo.toString((Math.abs(total) || ''), format);
        var color = 'black';
        if (total < 0) {
            totalString = '(' + totalString + ')';
            color = 'red';
        }
        return '<span style="color:' + color + '">'+totalString+'</span>';
    };
}

function getTotalTemplate(product, date) {
    return function (e) {
    	if (!hasTotalsColumnValue(e, 'delta')){
    	      return '';
    	}
        var value = +getTotalValue(e, product, date).toFixed(3);
        if (value === 0) {
            // since -0 === 0, this changes -0 to 0
            value = 0;
        }

        var isStrategyGroup = (e.StrategyName && e.StrategyName.groupField == 'StrategyName'),
		    format = isStrategyGroup ? 'n0' : 'n1';
		value = isStrategyGroup ? Math.round(value) : value;
	    var totalString =  kendo.toString(Math.abs(value), format);

        var color = 'black';
        if (value < 0) {
            totalString = totalString;
            color = 'red';
        }
        return `<span style="color:${color}">${totalString}</span>`;
    };
}

function getTotalFooterTemplate(product, date) {
    return function (e) {
    	if (!hasTotalsColumnValue(e, 'delta')){
  	      return '';
    	}
        var value = +getTotalValue(e, product, date, true).toFixed(3);
        if (value === 0) {
            // since -0 === 0, this changes -0 to 0
            value = 0;
        }
        var isStrategyGroup = (e.StrategyName && e.StrategyName.groupField == 'StrategyName'),
		    format = isStrategyGroup ? 'n0' : 'n1';
		value = isStrategyGroup ? Math.round(value) : value;
        var totalString =  kendo.toString(Math.abs(value), format);
        var color = 'black';
        if (value < 0) {
            totalString = totalString;
            color = 'red';
        }
        return `<span style="color:${color}">${totalString}</span>`;
    };
}

function getExposureTemplate(product, date) {
    return function (e) {
        if (!hasExposureValue(e, date)){
            return '';
        }
        var value = +getExposureValue(e, product, date).toFixed(3);
        if (value === 0) {
            // since -0 === 0, this changes -0 to 0
            value = 0;
        }

        var totalString =  kendo.toString(filterNaN(value), 'p1');
        var color = 'black';
        if (value < 0) {
            totalString = totalString;
            color = 'red';
        }
        return `<span style="color:${color}">${totalString}</span>`;
    };
}

function getExposureFooterTemplate(product, date) {
    return function (e) {
        if (!hasExposureFooter(e, date)){
            return '';
        }
        var value = +getExposureValue(e, product, date, true).toFixed(3);
        if (value === 0) {
            // since -0 === 0, this changes -0 to 0
            value = 0;
        }

        var totalString =  kendo.toString(filterNaN(value), 'p1');
        var color = 'black';
        if (value < 0) {
            totalString = totalString;
            color = 'red';
        }
        return `<span style="color:${color}">${totalString}</span>`;
    };
}

function getTotalValue(dataItem, product, date, isAggregate) {
    var month = date;
    if (date == 'new') {
        month = _dates[AllocationSheetGrid.settings.visibleMonths];
    }
    var products = product ? [product] : _products,
        tot = 0,
        // totalANAV = 0,
        prodIds = products.map(getProductId),
        productAbbrevs = prodIds.map(id => prodAbbrevs[id]);
    for (var i = 0; i < products.length; i++) {
        // totalANAV += ANAV[month][productAbbrevs[i]];
        if (dataItem.measure) {
            tot += apsAnchorCalcs.calculate(dataItem.measure, dataItem, `${products[i]}.${month}.EndBalance`);
        } else {
            for (var j = 0; j <= _dates.indexOf(month); j++) {
                if (isAggregate) {
                    tot += dataItem[`${products[i]}.${_dates[j]}.EndBalance`].sum;
                } else {
                    tot += dataItem[products[i]][_dates[j]].EndBalance;
                }
            }
        }
    }

    return tot ;
}

function getExposureValue(dataItem, product, date, isAggregate) {
    var month = date;
    if (date == 'new') {
        month = _dates[AllocationSheetGrid.settings.visibleMonths];
    }
    var products = product ? [product] : _products,
        tot = 0,
        totalANAV = 0,
        prodIds = products.map(getProductId),
        productAbbrevs = prodIds.map(id => prodAbbrevs[id]);
    for (var i = 0; i < products.length; i++) {
        totalANAV += ANAV[month][productAbbrevs[i]];
        if (dataItem.measure) {
            tot += apsAnchorCalcs.calculate(dataItem.measure, dataItem, `${products[i]}.${month}.EndBalance`);
        } else {
            for (var j = 0; j <= _dates.indexOf(month); j++) {
                if (isAggregate) {
                    tot += dataItem[`${products[i]}.${_dates[j]}.EndBalance`].sum;
                } else {
                    tot += dataItem[products[i]][_dates[j]].EndBalance;
                }
            }
        }
    }
    return tot * 1000000 / totalANAV;
}

function filterNaN(val) {
	if (equalsNaN(val)) {
		return '';
	} else {
		return val;
	}
}

function equalsNaN(val) {
    return  typeof val == 'number' && isNaN(val);
}

function setStrategyGroupFooters() {
	
	console.time('setStrategyGroupFooter');
	
    $('.k-grid-content-locked').find('tr.k-grouping-row[data-group-field="StrategyName"]').each(function () {
        var name = $(this).find('span[data-group-field="StrategyName"]').attr('data-group-value'),
            $footer = $(this).nextAll('tr.k-group-footer[data-group-field="StrategyName"]:first');
        $footer.html('<td class="k-group-cell">&nbsp;</td><td colspan="3" style="padding-left:5px;">TOTAL ' + name + '</td>');
    });
    
    console.timeEnd('setStrategyGroupFooter');
}

function getNAVTitle(dataItem, product, date) {
	if (dataItem.FUND_TYPE == 'FUND' || dataItem.measure){
		return '';
	}
	var title, first, lvgFactor, mgrEquity;
	if (dataItem[product] && dataItem[product][date]) {
		var nav = dataItem[product][date];
		
		for (var i in _dates){
			if (dataItem[product][_dates[i]].LEVERAGE_FACTOR){
				lvgFactor = dataItem[product][_dates[i]].LEVERAGE_FACTOR.toFixed(3);
				break;
			}
		}
		
		if (!lvgFactor && nav.EndBalance){
			lvgFactor = 'Unable to retrieve Leverage Factor.';
		}
		mgrEquity = nav.EQUITY_NAV ? 'Manager Equity: {0}\n'.formatStr([nav.EQUITY_NAV.toFixed(3)]) : '';
		lvgFactor = lvgFactor ? 'Leverage Factor: {0}'.formatStr([lvgFactor]) : '';
		title = mgrEquity + lvgFactor;
		
	}else if (dataItem.StrategyName && dataItem.StrategyName.groupField == 'CompositeGroup' && dataItem['{0}.{1}.EQUITY_NAV'.formatStr([product, date])]) { // aggregate - don't show leverage factor
		var meField = '{0}.{1}.EQUITY_NAV'.formatStr([product, date]);
		title = dataItem[meField].sum ? 'Manager Equity: {0}'.formatStr([dataItem[meField].sum.toFixed(3)]) : '';
	} else {
		title = '';
	}
	
	return encodeAsHtml(title);
}



function getInvestmentStyle(dataItem) {
	var colorString = '';
	if (isApproachingDeadline(dataItem)) {
		colorString = 'color: black;';
		apsApproachingComposites.push(dataItem.Composite);
	} else if (isNewInvestmentRow(dataItem)) {
		colorString = 'color: rgba(0, 18, 255, 0.68);';
		apsNewComposites.push(dataItem.Composite);
	}
	if(isDeadlineInCurrentMonth(dataItem)){
		
	}
    return colorString;
}

function isDeadlineInCurrentMonth(dataItem){
	
	var date_curr =  new Date();
    for (var i in _products) {
        for (var j in _dates) {
            var allocation = dataItem[_products[i]][_dates[j]];
            if (allocation.Status && allocation.Status.toLowerCase() != 'cancelled' && allocation.NEXT_NOTICE_DATE) {
               var nextNoticeDate = kendo.parseDate(allocation.NEXT_NOTICE_DATE.split('T')[0], 'yyyy-MM-dd');
               
               
               
               var curMonth = (date_curr + '').substring(4,7);
               var deadlineMonth = (nextNoticeDate+ '').substring(4,7);
               
               if(curMonth == deadlineMonth){            	   
            	   return true;
               }
            }
        }
    }
	
    return false;
}

function isNewInvestmentRow(dataItem) {
	if (dataItem.GridSection != 'Allocations') { return false; }
	for (var i in _products) {
	    if(dataItem[_products[i]][_dates[0]].EndBalance) {
	    	return false;
	    }
	}
	return false;
}

function isApproachingDeadline(dataItem, today, oneDay) {
	var approaching = [];
	var nonActionClasses = ['finalized', 'amd_finalized', 'amd_admin_validated', 'finance_approved', 'amd_finance_approved', 'letter_sent_failed',
	                        'amd_letter_sent_failed', 'letter_sent', 'amd_letter_sent', 'nt_processed', 'amd_nt_processed', 'cash_settled', 'amd_cash_settled']
    for (var i in _products) {
        for (var j in _dates) {
            var allocation = dataItem[_products[i]][_dates[j]];
            if (allocation.Status && apsUtils.getKeyByValue(workflowCodeMap, allocation.Status.toLowerCase()) < 9 && allocation.NEXT_NOTICE_DATE) {
                var nextNoticeDate = kendo.parseDate(allocation.NEXT_NOTICE_DATE.split('T')[0], 'yyyy-MM-dd');
              
                var daysDiff = nextNoticeDate - today;
               
				var daysRemaining = Math.ceil(daysDiff/oneDay)
				
                if ((daysRemaining <= 3) )  { //&& (daysRemaining > -1))  {
                	approaching.push(['tr[role="row"][data-group-value="'+dataItem.Composite+'"] > td[data-month="'+_dates[j]+'"]:not(:empty):not(.wf-state-' + nonActionClasses.join("):not(.wf-state-") + ').alloc-val', kendo.toString(nextNoticeDate, 'd')]); //[data-product="'+_products[i]+'"]
                	break;
                }
            }
        }
    }
    return approaching;
}

function getCompositeGroupStyle(dataItem, attr) {
    for (var key in dataItem) {
        if (key.split('.')[2] == 'NEXT_NOTICE_DATE' && dataItem[key].min) {
            if (new Date().getDate() - kendo.parseDate(dataItem[key].min, 'yyyy-MM-dd').getDate() <= 5) {
                return 'background-color: #FF957B;';
            }
        }
    }
    return '';
}

function calculateTotalANAV() {
	for (var month in ANAV) {
		ANAV[month].total = ANAV[month].SSIF + ANAV[month].CSS + ANAV[month].SSALT + ANAV[month].COSS;
	}
	for (var i in _dates) {
		if (ANAV[_dates[i]].total) {
			ANAV.lastAvailableDate = _dates[i];
		}
	}
}

function getANAV(month, key) {
	return ANAV[month][key]
		|| (_dates.indexOf(ANAV.lastAvailableDate) > _dates.indexOf(month) && ANAV[ANAV.lastAvailableDate][key])
		|| null;
}

function getProductName(id) {
	if (isNaN(id)) {
		id = INV_PROD_ABBREVS[id];
	}
	if (id === 7000001) {
		id = 7000017;
	}
	return _products[_product_ids.indexOf(id)];
}

function getProductId(name) {
	if (_products.indexOf(name) >= 0) {
		return _product_ids[_products.indexOf(name)];
	} else {
		return INV_PROD_ABBREVS[name];
	}
}

function hasCurColumnValue(dataItem) {
	return dataItem.Composite
			&& !(dataItem.StrategyName == 'SHORT TERM INVESTMENTS & LIQUIDITY' && !['VFN', 'Fund level cash'].indexOf(dataItem.Composite) > -1);
}

function hasCurColumnFooter(dataItem) {
	return dataItem.StrategyName.groupValue &&
			((!SHORT_TERM_STATS.some(function(e){return dataItem.StrategyName.groupValue.indexOf(e) > -1})) || (['VFN', 'Fund Level Cash'].indexOf(dataItem.StrategyName.groupValue) > -1));
}

function hasNewColumnValue(dataItem) {
	return dataItem.Composite
			&& !(dataItem.StrategyName == 'Statistics' || shortTermCalcs.shortsMulti.indexOf(dataItem.Composite) > -1);
}

function hasNewColumnFooter(dataItem) {
	return dataItem.StrategyName.groupValue 
		&& !(shortTermCalcs.shortsMulti.indexOf(dataItem.StrategyName.groupValue) > -1);
}

function hasTotalsColumnValue(dataItem, dataField) {
	var no_exposures_array = ["GPV_UTILIZED", "PCT_GPV_CHANGE_TO_SECOND_TRIGGER", "AVG_TIME_TO_LIQUIDATION", "PCT_LIQUID_IN_THREE_MONTHS", "GrandTotal"];
	return ((['Statistics', 'SHORT TERM INVESTMENTS & LIQUIDITY'].indexOf(dataItem.StrategyName) < 0) || ((no_exposures_array.indexOf(dataItem.measure) < 0) && (dataField != 'delta' || ["NAV_FORECAST", "AGAV_FORECAST", "ANAV_FORECAST"].indexOf(dataItem.measure) > -1)));
}

function hasTotalsColumnFooter(dataItem) {
	if (dataItem.StrategyName.groupValue == undefined){
		return true;
	}
	return dataItem.StrategyName.groupValue.indexOf('Grand Total') < 0;
//	});
}

function hasExposureValue(dataItem, date, product) {
	var no_exposures_array = ["GPV_UTILIZED", "PCT_GPV_CHANGE_TO_SECOND_TRIGGER", "AVG_TIME_TO_LIQUIDATION", "PCT_LIQUID_IN_THREE_MONTHS", "NAV_FORECAST", "ANAV_FORECAST", "AGAV_FORECAST"]
	return !((dataItem.StrategyName == 'Statistics' && (no_exposures_array.indexOf(dataItem.measure) > -1)) || 
			(dataItem.StrategyName == 'SHORT TERM INVESTMENTS & LIQUIDITY' && _dates.indexOf(date) == 0));
}

function hasExposureFooter(dataItem, date) {
	if (dataItem.StrategyName.groupValue == undefined){
		return true;
	}
	return (dataItem.StrategyName.groupValue != 'Grand Total') 
			&& (!SHORT_TERM_STATS.some(function(e){return dataItem.StrategyName.groupValue.indexOf(e) > -1}) || (_dates.indexOf(date) != 0 || ['VFN', 'Fund Level Cash'].some(function(e){return dataItem.StrategyName.groupValue.indexOf(e) > -1})));
	
}

//Switched to exclude all SHORT TERM INVESTMENTS & Exposures
function hasSSIFTest(dataItem) {
	return ! (dataItem.StrategyName == 'SHORT TERM INVESTMENTS & LIQUIDITY'
			|| dataItem.StrategyName == 'Statistics');
}

function hasContextChevron(dataItem){
	return ! (dataItem.StrategyName == 'SHORT TERM INVESTMENTS & LIQUIDITY'
		|| dataItem.StrategyName == 'Statistics');
}

function hasSSIFTestFooter(dataItem) {
	short_term_inv = ['SMA - Short Term Investments', 'Composite 12707'];
	return !SHORT_TERM_STATS.concat(short_term_inv).some(function(e){
		if (dataItem.StrategyName.groupValue == undefined){
			return true;
		}
		return dataItem.StrategyName.groupValue.indexOf(e) > -1;
	});
}

function isStatsSectionDataItem(dataItem){
	return (dataItem.StrategyName == 'Statistics'
		|| 	(dataItem.Composite && SHORT_TERM_STATS.some(function(e){return dataItem.Composite.indexOf(e) > -1}))
		)
}



function createTotalTipsNew(){
	
	console.time('createTotalTipsNew');
	$('[class="k-grid-content-locked"] > table > tbody > [data-group-value="Fund Level Cash"]').attr('title','Cash held at the SS fund level. This does not include FX buffers that are held at the COSS and CSS CCY cell level');
	$('[class="k-grid-content-locked"]').find('tr').each(function(){$(this).addClass('simple-qtip'); });
	console.time('createTotalTipsNew');
}

function getWFStateTitle(dataItem, product, date){
	return dataItem[product][date].Status ? dataItem[product][date].Status.split('_').join(' ') : null;
}

function getCompositeWFAttribute(data, colName, attribute){
	if (data[colName + '.WF_CODE'].min != null && data[colName + '.WF_CODE'].min > 0 && data.StrategyName.groupField == 'CompositeGroup'){
		if (attribute == 'title'){
			return workflowCodeMap[data[colName + '.WF_CODE'].min].toUpperCase().split('_').join(' ');
		} else if (attribute == 'class') {
			return " wf-state-" + workflowCodeMap[data[colName + '.WF_CODE'].min];
		}
	}
	return '';
}

function getSsifTest2ColorClass(data, month){
	var baseclass;
	if (data.StrategyName && data.StrategyName.groupField == 'CompositeGroup'){
		baseclass = ssifTest2ClassMap[data['ssifTest2.' + month + '.unique'].average];
		return baseclass ?  baseclass + '-comp' : '';
	}
	baseclass = data.ssifTest2 ? ssifTest2ClassMap[data.ssifTest2[month].unique] : null;
	return baseclass ?  baseclass + '-inv' : '';
}

function getOverflowTooltip(dataItem, product, date){
	var title = '';
	if (isStatsSectionDataItem(dataItem)){
		var value = apsAnchorCalcs.calculate(dataItem.measure, dataItem, product +'.'+date+'.'+'EndBalance');
		var format = dataItem.format || 'n1';
		var formatted = kendo.toString(value, format);
		if (formatted && formatted.length > 5){
			title = formatted;
		}
	}
	return title;
}

function getTempTitles(dataItem){

	if(dataItem.GridSection == 'Allocations'){
		return dataItem.InvestmentName + (dataItem.IS_DEFAULT ? '' : ' Clone' );
	}
	else if(dataItem.StrategyName === "SHORT TERM INVESTMENTS & LIQUIDITY" || (dataItem.StrategyName === 'Statistics' && dataItem.GridSection === 'Other')){
		if(dataItem.measure){
			return DATA_DEFINITON_MAP[dataItem.measure];
		}
		else{
			return DATA_DEFINITON_MAP[dataItem.Composite];
		}
	}
	return '';
}

//fixes the widthes of the top and bottom grids on the right, and the top and bottom grids on left
function fixWidthGrids(){
	var $totalsGrid = $('#totals-grid'),
		$grid = $('#grid'),
		$totalsGridLocked = $totalsGrid.children('.k-grid-content-locked'),
		$totalsGridLockedTable = $totalsGridLocked.children('table'),
		$totalsGridContent = $totalsGrid.children('.k-grid-content');

	var x = $grid.children('.k-grid-content-locked').width() - 32; //width of grid containing tr headers
	if ($totalsGridLocked.width() != x) {
		$totalsGridLocked.width(x); //we take away 30 ish to compensate for the down arrow and the white padding around it
	}
	if ($totalsGridLockedTable.width() != x) {
		$totalsGridLockedTable.width(x);
	}

	var y = $grid.children('.k-grid-content').width(); //width of main grid with all allocations
	if ($totalsGridContent.width() != y) {
		$totalsGridContent.width(y);
	}
}

function deepCopyASRow(di) {
	if (!di || !di.length){return di;}
    var clone = {};
    for (var field in di) {
        if (di.hasOwnProperty(field) && _products.indexOf(field) < 0) {
            clone[field] = di[field];
        }
    }
    for (var i = 0; i < _products.length; i++) {
        clone[_products[i]] = {};
        for (var j = 0; j < _dates.length; j++) {
            clone[_products[i]][_dates[j]] = di[_products[i]][_dates[j]];
        }
    }
    return clone;
}

var AllocationSheetTools = (function () {

	var _refreshLiquidityTerms = true,
		_availableSnapshotDates;

	var api = {};

	api.initStaticTools = (function () {
		//initColumnMenu();
		initOfflineToggle();
		initSnapshotDropDown();
		initDatePicker();
	});

	api.initGridTools = (function () {
		initMonthSelectors();
	});

    api.initEditableCells = (function (editable) {
        var $target = $('#grid tr:not(.k-grouping-row):not(.k-group-footer) td.numeric.alloc-val:not(.cur):not(.new)');
        if (editable) {
            $target.on('click', handleCellClick);
        } else {
            $target.off('click', handleCellClick);
        }
    });

    function handleCellClick(event) {
        var $cell = $(event.currentTarget);
        $cell.addClass('currentEdit');
        customNavCustomEditor($cell);
    }

	function initColumnMenu() {
	    var menu = $("#column-menu").kendoMenu({ openOnClick: true }).data("kendoMenu");

	    menu.append([
	        {
		        text: '<span class="k-icon k-i-columns"></span>',
		        encoded: false,
		        cssClass: 'no-arrow',
		        items: [
					{ text: 'Expand/Collapse' },
					{
					  text: '<label for="toggle-test-1-column"><input id="toggle-test-1-column" name="toggle-column-group" data-group="test-1" type="checkbox" />Test 1</label>',
					  encoded: false
					},
					{
					  text: '<label for="toggle-test-2-columns"><input id="toggle-test-2-columns" name="toggle-column-group" data-group="test-2" type="checkbox" checked />Test 2</label>',
					  encoded: false
					},
					{
					  text: '<label for="toggle-test-2-cur-column"><input id="toggle-test-2-cur-column" name="toggle-column-group" data-group="test-2-cur" type="checkbox" />Test 2 Cur</label>',
					  encoded: false
					},
					{
					  text: '<label for="toggle-liquidity-terms-columns"><input id="toggle-liquidity-terms-columns" class="offline-disabled" name="toggle-column-group" data-group="liquidity-terms" type="checkbox" checked />Liquidity Terms</label>',
					  encoded: false
					}
		        ]
	        }
	    ]);

	    $('input[name="toggle-column-group"]').change(function () {
	    	var show = $(this).is(':checked'),
	    		group = $(this).attr('data-group');
	    	api.showColumnGroup(group, show);
	    });

	    api.columnMenu = menu;
	}

	function initMonthSelectors() {

		$('.month-slider-qtip').each(function () {
			var $optionMenu = $(this),
				product = $optionMenu.attr('data-product'),
				testSection = $optionMenu.attr('data-test-section'),
				section = product || (testSection + '-test'),
				minVal = $optionMenu.attr('data-min'),
				maxVal = $optionMenu.attr('data-max'),
				defaultVal = $optionMenu.attr('data-default');
			$optionMenu.qtip({
			    position: { at: 'top-center', my: 'bottom-right' },
			    content: {
			        text: '<input id="' + section + '-months" type="range" min="' + minVal + '" max="' + maxVal + '" value="' + defaultVal + '">',
			        title: 'Months: <span id="' + section + '-months-val">' + defaultVal + '</span>'
			    },
			    style: {
			        tip: { corder: true, border: 1 },
			        classes: 'qtip-rounded'
			    },
			    show: 'click',
			    hide: 'unfocus',
			    events: {
			        render: function () {
			            $('#' + section + '-months').on('input change', function () {
			                $('#' + section + '-months-val').text($(this).val());
			            });
			            $('#' + section + '-months').change(function () {
			            	var months = parseInt($(this).val());
			            	if (product) {
	                        	showMonths(months, product);
			            	} else {
			            		showTestMonths(months, testSection);
			            	}
	                        $optionMenu.trigger('unfocus');
	                    });
			        },
			        show: function () {
			        	var months;
			        	if (product) {
			        	    months = $('th[data-prodname="' + product + '"]').data('visibleMonths');
			        	} else {
			        		months = $('th[data-header-section="' + testSection + '"]').data('visibleMonths');
			        	}
			        	$('#' + section + '-months').val(months);
			        	$('#' + section + '-months-val').text(months);
			        }
			    }
			});
		});

		$('.prod-months-selector').each(function () {
			$(this).click(function () {
				$('#grid.k-grid-content-locked > table > tbody > tr:nth-last-child(4)').attr('role','formatter');

				var product = $(this).attr('data-product'),
				testSection = $(this).attr('data-test-section'),
				months = parseInt($(this).attr('data-months'));

				if (product) {
					showMonths(months, product);
				} else {
					showTestMonths(months, testSection);
				}
			});
		});

		$('#grid th[data-prodname]').each(function () {
			$(this).data('visibleMonths', AllocationSheetGrid.settings.visibleMonths);
		});

		$('#grid th[data-header-section]').each(function () {
            var months = 1;
            if ($(this).attr('data-header-section') === 'total') {
                months = 0;
            }
			$(this).data('visibleMonths', months);
		});
	}

	function initOfflineToggle() {
		if (window.OFFLINE_ENABLED) {
			var $toggle = $("#offline-toggle");
			$toggle.kendoMobileSwitch({
	            checked: APSDataService.online(),
	            change: function() {
	                APSDataService.online(this.value());
	            }
	        }).parents(
	        	'.offline-toggle-wrapper'
	        ).show();
			api.offlineToggle = $toggle.data('kendoMobileSwitch');
		} else {
			api.offlineToggle = {};
		}
	}

	function initDatePicker() {
        api.datePicker = $('#date-picker').kendoDatePicker({
            start: 'year',
            depth: 'year',
            format: 'MMM yyyy',
            value: new Date(),
            change: dateChange
        }).data('kendoDatePicker');
	}

	function initSnapshotDropDown() {
		api.isSnapshot = Boolean(mioUtils.parseURLQuery().snapshot);
    	getSnapshotDateRange().then(function (resp) {
    		api.snapshotDropDown = $('#snapshot-dropdown').kendoDropDownList({
    			dataSource: resp.available_dates,
    			dataTextField: 'text',
    			dataValueField: 'value',
    			change: function (e) {
    				api.isSnapshot = Boolean(e.sender.value());
    				dateChange(e);
    			}
    		}).data('kendoDropDownList');
    		if (api.isSnapshot) {
    			api.snapshotDropDown.value(mioUtils.parseURLQuery().as_of);
    		}
    	});
	}

	function dateChange(e) {
    	var asOfDate = e.sender.value();
    	if (asOfDate && !api.isSnapshot) {
	    	asOfDate.setDate(1);
	    	asOfDate.setMonth(asOfDate.getMonth() + 1);
	    	asOfDate.setDate(0);
    	}
    	if (asOfDate && (typeof asOfDate != 'string')) {
    		asOfDate = kendo.toString(asOfDate, 'yyyy-MM-dd');
    	} else if (!asOfDate) {
    		asOfDate = undefined;
    	}
    	reloadWindow({
    		as_of: asOfDate,
    		snapshot: api.isSnapshot
    	}, true);
    }

	function getSnapshotDateRange() {
		var retrievedRange = $.Deferred();
		if (_availableSnapshotDates) {
			retrievedRange.resolve({ status: 'success', available_dates: _availableSnapshotDates });
		} else {
			APSDataService.get({
				svc_module: 'dal_service',
				svc_function: 'get_snapshot_date_range',
				data: {
					module: 'ALLO'
				},
				success: function (resp) {
		    		var dates = [{ value: null, text: 'Live' }];
		    		dates = dates.concat(
		    			$.map(resp.available_dates, function (e) {
			    			var dateStr = kendo.toString(kendo.parseDate(e, 'yyyy-MM-ddTHH:mm:ss'), 'yyyy-MM-dd');
			    			return { text: dateStr, value: dateStr };
			    		})
		    		);
		    		resp.available_dates = dates;
					_availableSnapshotDates = dates;
					retrievedRange.resolve(resp);
				}
			});
		}
		return retrievedRange;
	}

	api.showColumnGroup = function (group, show) {
		var visibleSSIFTest2Months = $('#grid [data-header-section="ssiftest2"]').data('visibleMonths'),
			fields = {
		        'test-1': ['ssiftest1.cur'],
                'test-2': ['ssifTest2.new'].concat(_dates.slice(1, visibleSSIFTest2Months + 1).map(date => `ssifTest2.${date}`)),
                'test-2-cur': ['ssifTest2.cur'],
		        'liquidity-terms': ['NEXT_NOTICE_DATE', 'LIQUIDITY_MONTH']
		    };

        showGridColumns(fields[group], show);
	}

	return api;

})();

var AllocationSheetGrid = (function () {

	var NEXT_NOTICE_DATE = {},
		LIQUIDITY_MONTH = {},
		PRIORITY_LEVEL = {},
		COMPOSITE_LEVEL_INVESTMENTS = {},
	   	settingsKey = 'AllocationSheetSettings';

	var defaultSettings = {
		visibleMonths: 4,
        exposureMonths: {},
        productMonths: {},
        ALLOW_PAST_EDIT: false
	};

	function configureSettings() {
	    var settings = mioUtils.deepCopy(defaultSettings);
		if (settingsKey in localStorage) {
			var savedSettings = JSON.parse(localStorage.getItem(settingsKey));
			settings = Object.assign(settings, savedSettings);
		}
        return settings;
	}

	function saveSettings() {
		var settings = {
			visibleMonths: $('#all-prods-numeric').data('kendoNumericTextBox').value()
		};
		localStorage.setItem(settingsKey, JSON.stringify(settings));
	}

	function getInvestmentId(dataItem) {
		var compositeId = dataItem.CompositeId && dataItem.CompositeId.min;
		return compositeId ? COMPOSITE_LEVEL_INVESTMENTS[compositeId] : dataItem.InvestmentId;
	}

	function getPriorityClass(dataItem) {
		var level = PRIORITY_LEVEL[getInvestmentId(dataItem)];
	    return level ? 'priority-' + level : '';
	}

	function nextNoticeDateClass(dataItem) {
		var classes = 'liquidity-terms-column section-separator cur ';
		return classes + getPriorityClass(dataItem);
	}

	function liquidityMonthClass(dataItem) {
		var classes = 'liquidity-terms-column ';
		return classes + getPriorityClass(dataItem);
	}

	function nextNoticeDateTemplate(dataItem) {
		var nextNotice = kendo.toString(NEXT_NOTICE_DATE[getInvestmentId(dataItem)] || '', 'MM/dd/yyyy');
		return nextNotice;
	}

	function liquidityMonthTemplate(dataItem) {
		var liqMonth = kendo.toString(LIQUIDITY_MONTH[getInvestmentId(dataItem)] || '', 'MMM yyyy');
		return liqMonth;
	}

	function refreshLiquidityTerms() {
		return getCalculatedLiquidityTerms().then(function (liquidityTerms) {
			NEXT_NOTICE_DATE = liquidityTerms.NEXT_NOTICE_DATE;
			LIQUIDITY_MONTH = liquidityTerms.LIQUIDITY_MONTH;
			PRIORITY_LEVEL = liquidityTerms.PRIORITY_LEVEL;
			COMPOSITE_LEVEL_INVESTMENTS = liquidityTerms.COMPOSITE_LEVEL_INVESTMENTS;
			for (var inv in NEXT_NOTICE_DATE) {
				NEXT_NOTICE_DATE[inv] = kendo.parseDate(NEXT_NOTICE_DATE[inv], 'yyyy-MM-dd');
				LIQUIDITY_MONTH[inv] = kendo.parseDate(LIQUIDITY_MONTH[inv], 'yyyy-MM');
			}
		});
	}

	var api = {
		IS_READ_ONLY: Boolean(mioUtils.parseURLQuery().snapshot),
		templates: {
			NEXT_NOTICE_DATE: nextNoticeDateTemplate,
			LIQUIDITY_MONTH: liquidityMonthTemplate,
		},
		attributes: {
			NEXT_NOTICE_DATE: { 'class': '#= AllocationSheetGrid.classes.NEXT_NOTICE_DATE(data) #', 'style': 'text-align: center;', 'data-field': 'NEXT_NOTICE_DATE' },
			LIQUIDITY_MONTH: { 'class': '#= AllocationSheetGrid.classes.LIQUIDITY_MONTH(data) #', 'style': 'text-align: center;', 'data-field': 'LIQUIDITY_MONTH' }
		},
		headerAttributes: {
			NEXT_NOTICE_DATE: { 'class': 'liquidity-terms-column section-separator cur', 'style': 'text-align: center;', 'data-field': 'NEXT_NOTICE_DATE' },
			LIQUIDITY_MONTH: { 'class': 'liquidity-terms-column', 'style': 'text-align: center;', 'data-field': 'LIQUIDITY_MONTH' },
			LIQUIDITY_TERMS: { 'class': 'liquidity-terms-column', 'data-header-section': 'liquidity-terms' }
		},
		classes: {
			NEXT_NOTICE_DATE: nextNoticeDateClass,
			LIQUIDITY_MONTH: liquidityMonthClass
		},
		settings: configureSettings(),
		saveSettings: saveSettings,
		refreshLiquidityTerms: refreshLiquidityTerms
	};

	return api;

})();

