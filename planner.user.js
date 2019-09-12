// ==UserScript==
// @id             iitc-plugin-planner@nobody889
// @name           IITC plugin: Planner
// @category       Info
// @version        0.3.0
// @namespace      https://github.com/lithium/iitc-plugin-planner
// @updateURL      @@UPDATEURL@@
// @downloadURL    @@DOWNLOADURL@@
// @description    [@@BUILDNAME@@-@@BUILDDATE@@] Build plans with drawtools
// @include        https://*.ingress.com/intel*
// @include        http://*.ingress.com/intel*
// @match          https://*.ingress.com/intel*
// @match          http://*.ingress.com/intel*
// @include        https://*.ingress.com/mission/*
// @include        http://*.ingress.com/mission/*
// @match          https://*.ingress.com/mission/*
// @match          http://*.ingress.com/mission/*
// @grant          none
// ==/UserScript==


function wrapper(plugin_info) {
// ensure plugin framework is there, even if iitc is not yet loaded
if(typeof window.plugin !== 'function') window.plugin = function() {};




// PLUGIN START ////////////////////////////////////////////////////////


window.plugin.planner = function() {};

window.plugin.planner.loadPlanFromDrawtools = function(drawToolsItems) {

  this.currentPlan = drawToolsItems;

}




var llstring = function(latlng) {
  if (typeof latlng.lat != 'undefined' && typeof latlng.lng != 'undefined')
  {
      return latlng.lat + ',' + latlng.lng;
  }
}

window.plugin.planner.handlePortalAdded = function(data) {
  var portal = data.portal;
  var guid = portal.options.guid;
  var ll = llstring( portal._latlng );
  var title = portal.options.data.title || guid;

  console.log("portalAdded", data.portal, title)

  this.portal_by_guid[guid] = portal
  this.portal_by_ll[ll] = portal
}





window.plugin.planner.setup = function() {

  this.portal_by_guid = {};
  this.portal_by_ll = {};
  this.currentPlan = [];

  window.addHook('portalAdded', this.handlePortalAdded.bind(this));


  window.pluginCreateHook('pluginDrawTools'); // initialize hook if needed first
  window.addHook('pluginDrawTools', this.handleDrawTools.bind(this));

  this.loadPlanFromDrawtools(JSON.parse(localStorage['plugin-draw-tools-layer']))

  $('#toolbox').append('<a tabindex="0" onclick="plugin.planner.showPlannerDialog();">Planner</a>');

  if (window.useAndroidPanes()) {
    this.mobilePane = document.createElement('div');
    this.mobilePane.className = 'plugin-planner-pane';

    var button = this.mobilePane.appendChild(document.createElement('button'));
    button.textContext = 'Planner';
    button.addEventListener('click', function(){ this.showPlannerDialog(); }.bind(this), false);

    this.tabs = this.mobilePane.appendChild(document.createElement('div'));
    this.tabBar = this.tabs.appendChild(document.createElement('ul'));
    this.tabHeaders = {};
    this.tabMarkers = {};
    
    $(this.tabs)
      .tabs({
        activate: function(event, ui) {
          if(!ui.newTab) return;
          
          var header = $(ui.newTab)[0];
          var id = header.dataset['plan_id'];
        }.bind(this),
      })
      .find('.ui-tabs-nav').sortable({
        axis: 'x',
        stop: function() {
          $(this.tabs).tabs('refresh');
        },
      });
    
    android.addPane('plugin-planner', 'Planner', 'ic_planner');


    addHook('paneChanged', this.handlePaneChanged.bind(this));

  }


};

window.plugin.planner.getPortalFromLatlng = function(latlng) {
    var ll = llstring(latlng)
    var portal = this.portal_by_ll[ll]
    return portal;
}
window.plugin.planner.portalTitle = function(portal) {
    return portal ? 
      (portal.options.data.title || llstring(portal._latlng)) : 
      portal 
      ;
}

window.plugin.planner.renderPlanViewer = function(plan) {
  var container = document.createElement('table');

  var previousStep;
  plan.forEach(function(step) {
    container.appendChild(this.renderStep(step, previousStep));
    if (step.type == "polyline") 
      previousStep = step;
  }, this);

  return container;
};

window.plugin.planner.renderStep = function(step, previous) {
  var container = document.createElement('tr');
  container.className = 'plugin-planner-step';

  if (step.type == "polyline") {
    var src_ll = llstring(step.latLngs[0]);
    var src_portal = this.portal_by_ll[src_ll];
    var src_td = container.appendChild(document.createElement('td'));

    var previous_ll = previous ? llstring(previous.latLngs[0]) : undefined
    if (!previous_ll || previous_ll != src_ll) {
      src_td.innerHTML = this.portalTitle(src_portal) || src_ll;
    }

    var dest_ll = llstring(step.latLngs[1]);
    var dest_portal = this.portal_by_ll[dest_ll];
    var dest_td = container.appendChild(document.createElement('td'));
    dest_td.innerHTML = this.portalTitle(dest_portal) || dest_ll;
  }


  return container;
};

window.plugin.planner.showPlannerDialog = function() {
  console.log("currentPlan", this.currentPlan)

  dialog({
    html: this.renderPlanViewer(this.currentPlan),
    height: 'auto',
    width: '400px',
    collapseCallback: this.collapseFix,
    expandCallback: this.collapseFix,
  }).dialog('option', 'buttons', {
    'OK': function() { $(this).dialog('close'); },
  });

};

window.plugin.planner.collapseFix = function() {
  if (this && this.parentNode) {
    this.parentNode.style.height = 'auto';
  }
}

window.plugin.planner.handlePaneChanged = function(pane) {
  if(pane == 'plugin-planner') {
    document.body.appendChild(this.mobilePane);
  } else if(this.mobilePane.parentNode) {
    this.mobilePane.parentNode.removeChild(this.mobilePane);
  }
};

window.plugin.planner.handleDrawTools = function(payload) {
  console.log("handle draw tools", arguments)
}


// PLUGIN END //////////////////////////////////////////////////////////

var setup =  window.plugin.planner.setup.bind(window.plugin.planner);

setup.info = plugin_info; //add the script info data to the function as a property
if(!window.bootPlugins) window.bootPlugins = [];
window.bootPlugins.push(setup);
// if IITC has already booted, immediately run the 'setup' function
if(window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end
// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('('+ wrapper +')('+JSON.stringify(info)+');'));
(document.body || document.head || document.documentElement).appendChild(script);


