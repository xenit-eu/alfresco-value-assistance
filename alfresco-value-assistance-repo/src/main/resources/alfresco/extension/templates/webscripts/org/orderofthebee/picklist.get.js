function find(valuesArray, value) {
	for (var i = 0; i < valuesArray.length; ++i) {
		if (value && valuesArray[i].value == value.toString()) {
			return i;
		}
	}

	return -1;
}

function fixEncodedText(text) {
	var fixedText;
	try{
		// If the string is UTF-8, this will work and not throw an error.
		fixedText = decodeURIComponent(escape(text));
	}catch(e){
		// If it isn't, an error will be thrown, and we can asume that we have an ISO string.
		fixedText = text;
	}

	return fixedText;
}

function main() {

	var pickListName;
	var pickListLevel;
	var includeBlankItem;
	var loadLabels;
	var initialValues;
	var sortDirection;
	var parentSite = "";
	var parentSiteProp = "";
	var parentSitePropNode = "";

	if (args.name === null) {
		status.code = 500;
		status.message = "Missing name parameter";
		status.redirect = true;
		return;
	} else {
		pickListName = args.name;
	}

	pickListLevel = parseInt(args.level, 10);
	if (isNaN(pickListLevel)) {
		pickListLevel = 1;
	}

	includeBlankItem = (args.includeBlankItem === 'true');
	loadLabels = args.loadLabels;

	if (args.initialValues === null) {
		initialValues = [ "" ];
	} else {
		initialValues = args.initialValues.split(",");
	}

	var valueParameter;

	switch (pickListLevel) {
	case 1:
		valueParameter = "";
		break;
	case 2:
		valueParameter = "level1";
		break;
	default:
		break;
	}

	var filterValue = args[valueParameter];

	if (args.sort == 'desc' || args.sort == 'asc') {
		sortDirection = args.sort;
	}

	if (!!args.parentSite) {
		parentSite = args.parentSite.replace('"', '')
	}

	if (!!args.parentSiteProp) {
		parentSiteProp = args.parentSiteProp.replace('"', '')
	}

	if (!!args.parentSitePropNode) {
		parentSitePropNode = args.parentSitePropNode.replace('"', '')
	}

	var realParentSite = findParentSite(parentSite, parentSiteProp, parentSitePropNode);

	model.picklistItems = getPickListItems(pickListName, pickListLevel,
			includeBlankItem, loadLabels, initialValues, valueParameter,
			filterValue, sortDirection, realParentSite);
}

function findParentSite(parentSiteName, parentSiteProp, parentSitePropNode) {
	if (!!parentSiteName) {
		return parentSiteName;
	}
	if (!!parentSiteProp && !!parentSitePropNode) {
		var node = search.findNode(parentSitePropNode);

		// recurse upwards until we find a node where the property is defined
		var found = node.getPropertyNames(true).indexOf(parentSiteProp) != -1;
		while(!!node.parent && !found) {
			node = node.parent;
			found = node.getPropertyNames(true).indexOf(parentSiteProp) != -1;
		}

		if (found) {
			// return site name
			return node.properties[parentSiteProp];
		}
	}
	return "";
}

function getPickListItems(pickListName, pickListLevel, includeBlankItem,
		loadLabels, initialValues, valueParameter, filterValue, sortDirection, parentSite) {

	var fixedPickListName = fixEncodedText(pickListName);

	var dataListQuery = 'TYPE:"{http://www.alfresco.org/model/datalist/1.0}dataList"';
	dataListQuery = dataListQuery + ' AND =cm:title:"' + fixedPickListName + '"';

	if (!!parentSite) {
		var siteNode = siteService.getSite(fixEncodedText(parentSite));
		if (siteNode != null) {
			dataListQuery = dataListQuery + ' AND ANCESTOR:"' + siteNode.getNode().getNodeRef() + '"'
		}
	}

	var dataListSearchParameters = {
		query: dataListQuery,
		language: "fts-alfresco",
		page: {maxItems: 1000},
		templates: []
	};

	var dataListResult = search.query(dataListSearchParameters);

	var result = [];

	if (dataListResult.length == 0) {
		model.error = "Unable to locate data list object with title "
				+ pickListName;
	} else {

		var dataList;
		if (dataListResult.length > 0) {
			dataList = dataListResult[0];
		}

		var valueProperty;
		var labelProperty;
		var filterProperty;

		var pickListItemsQuery = "PARENT:\"" + dataList.nodeRef + "\"";

		switch (pickListLevel) {
		case 1:
			pickListItemsQuery = pickListItemsQuery
					+ " AND ASPECT:\"va:level1Aspect\"";

			valueProperty = "va:level1Value";
			labelProperty = "va:level1Label";
			break;
		case 2:
			pickListItemsQuery = pickListItemsQuery
					+ " AND ASPECT:\"va:level2Aspect\"";
			valueProperty = "va:level2Value";
			labelProperty = "va:level2Label";
			filterProperty = "va:level1Value";
			break;
		default:
			break;
		}

		if (pickListLevel > 1
				&& (filterValue === null || filterValue.length === 0)) {

			// returns a empty list because the filter value is empty
			var pickListItem = {};
			pickListItem.value = "";
			pickListItem.label = "";

			result.push(pickListItem);
		} else {

			var fixedFilterValue = fixEncodedText(filterValue);

			if (typeof filterProperty !== "undefined") {
				pickListItemsQuery = pickListItemsQuery + " AND "
						+ filterProperty + ":\"" + fixedFilterValue + "\"";
			}

			var pickListItemsSearchParameters = {
				query : pickListItemsQuery,
				language : "fts-alfresco"
			};

			if (sortDirection) {
				pickListItemsSearchParameters['sort'] = [{
					column: valueProperty,
					ascending: (sortDirection == 'asc')
				}];
			}

			var pickListItemsResult = search
					.query(pickListItemsSearchParameters);

			// see if we're just supposed to send back some labels
			if (loadLabels) {
				var labels = [];

				valueLabelPairs = [];

				for (var i = 0; i < pickListItemsResult.length; i++) {
					dataListItem = pickListItemsResult[i];

					var pickListItemValue = dataListItem.properties[valueProperty];
					var pickListItemLabel = dataListItem.properties[labelProperty];

					valuePair = {};
					valuePair.value = pickListItemValue;
					valuePair.label = pickListItemLabel;

					valueLabelPairs.push(valuePair);
				}

				for (var j = 0; j < initialValues.length; j++) {
					var item = find(valueLabelPairs, initialValues[j]);

					if (item < 0) {
						labels.push(initialValues[j]);
					} else {
						labels.push(valueLabelPairs[item].label);
					}
				}

				model.labels = labels.toString();
			} else {

				if (includeBlankItem) {
					var pickListItem = {};
					pickListItem.value = "";
					pickListItem.label = "";

					result.push(pickListItem);
				}

				var dataListItem;

				for (var i = 0; i < pickListItemsResult.length; i++) {
					dataListItem = pickListItemsResult[i];

					var pickListItemValue = dataListItem.properties[valueProperty];
					var pickListItemLabel = dataListItem.properties[labelProperty];

					// avoid adding repeated items
					if (pickListItemValue && find(result, pickListItemValue) < 0) {
						var pickListItem = {};
						pickListItem.value = pickListItemValue;
						pickListItem.label = pickListItemLabel;

						result.push(pickListItem);
					}
				}
			}
		}

		return result;
	}
}

main();
