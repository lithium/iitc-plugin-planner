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


/*
 * global utility functions
 */

var llstring = function(latlng) {
  if (typeof latlng.lat != 'undefined' && typeof latlng.lng != 'undefined')
  {
      return latlng.lat.toFixed(6) + ',' + latlng.lng.toFixed(6);
  }
}


/*
 * class PlanItem
 */

function PlanItem(src, dest) {
  this.src = src
  this.dest = dest
}
PlanItem.prototype.uniqid = function() {
  return [llstring(this.src), llstring(this.dest)].sort().join("<=>");
}



/*
 * class PlannerPlugin 
 *    global plugin singleton
 */

function PlannerPlugin() {
  this.portal_by_guid = {};
  this.portal_by_ll = {};

  // iitc hooks
  window.addHook('portalAdded', this.handlePortalAdded.bind(this));
  window.pluginCreateHook('pluginDrawTools'); // initialize hook if needed first
  window.addHook('pluginDrawTools', this.handleDrawTools.bind(this));


  // load initial plan
  this.loadPlanFromDrawtools(JSON.parse(localStorage['plugin-draw-tools-layer']))


  this.setupDesktop();
  this.setupMobile();
}

// plugin boot - called by iitc
PlannerPlugin.boot = function() {
  window.plugin.planner = new PlannerPlugin()
}

PlannerPlugin.prototype.setupDesktop = function() {
  $('#toolbox').append('<a tabindex="0" onclick="plugin.planner.showPlannerDialog();">Planner</a>');
}

PlannerPlugin.prototype.setupMobile = function() {
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
}

PlannerPlugin.prototype.handlePaneChanged = function(pane) {
  if(pane == 'plugin-planner') {
    document.body.appendChild(this.mobilePane);
  } else if(this.mobilePane.parentNode) {
    this.mobilePane.parentNode.removeChild(this.mobilePane);
  }
};

PlannerPlugin.prototype.handlePortalAdded = function(data) {
  var portal = data.portal;
  var guid = portal.options.guid;
  var ll = llstring( portal._latlng );
  var title = portal.options.data.title || guid;

  // console.log("PLAN portalAdded", data.portal, title)

  this.portal_by_guid[guid] = portal
  this.portal_by_ll[ll] = portal

  if (this.items.map(function(i) { return [llstring(i.src), llstring(i.dest)]}).flat().includes(ll)) {
    this.rerender();
  }
}

PlannerPlugin.prototype.handleDrawTools = function(payload) {
  // console.log("PLAN handleDrawTools", payload)
  if (!payload) {
    return;
  }

  if (payload.event === "clear") {
    this.items = []
    this.rerender();
  } 
  else if (payload.event === "layerCreated") {
    this.addDrawToolsLayer(payload.layer);
    this.rerender();
  }
  else if (payload.event === "layersDeleted" || payload.event === "import") {
    // we dont get notified what was deleted, clobber everything for now
    this.loadPlanFromDrawtools(JSON.parse(localStorage['plugin-draw-tools-layer']))
    this.rerender();
  }
}



PlannerPlugin.prototype.loadPlanFromDrawtools = function(drawToolsItems) {
  this.items = [];
  drawToolsItems.forEach(function(drawItem) {
    this.addDrawToolsLayer(drawItem);
  }.bind(this));
}

PlannerPlugin.prototype.addDrawToolsLayer = function(layer) {
  var latlngs = layer.latLngs || layer._latlngs

  if (latlngs.length == 2) {
    this.addLink(latlngs[0], latlngs[1]);
  } else if (latlngs.length == 3) {
    this.addLink(latlngs[0], latlngs[1]);
    this.addLink(latlngs[0], latlngs[2]);
    this.addLink(latlngs[1], latlngs[2]);
  }
}

PlannerPlugin.prototype.addLink = function(src, dest)  {
  var newItem = new PlanItem(src, dest);
  // console.log("PLAN addLink", newItem.uniqid())
  if (this.items.findIndex(function(i) { return i.uniqid() == newItem.uniqid(); }) == -1) {
    this.items.push(newItem)
  }
}

PlannerPlugin.prototype.portalFromLatlng = function(latlng) {
    var ll = llstring(latlng)
    var portal = this.portal_by_ll[ll]
    return portal;
}

PlannerPlugin.prototype.portalTitle = function(portal) {
    return portal ? 
      (portal.options.data.title || llstring(portal._latlng)) : 
      portal 
      ;
}

PlannerPlugin.prototype.renderPlanViewer = function(plan) {
  this.container = document.createElement('table');
  this.rerender();
  return this.container;
};

PlannerPlugin.prototype.rerender = function() {
  if (!this.container) return;
  this.container.innerHTML = "";

  var sort_a = this.container.appendChild(document.createElement('a'));
  sort_a.innerHTML = "Sort by source"
  sort_a.onclick = function() { this.sortItemsBySource(); this.rerender(); }.bind(this);

  var previousStep;
  this.items.forEach(function(step, idx) {
    this.container.appendChild(this.renderStep(step, idx, previousStep));
    previousStep = step;
  }, this);

}

PlannerPlugin.prototype.sortItemsBySource = function() {
  this.items.sort(function(a, b) {
    return llstring(a.src).localeCompare(llstring(b.src))
  })
}

PlannerPlugin.prototype.moveStepUp = function(stepIdx) {
  if (stepIdx > 0) {
    this.moveByIndex(this.items, stepIdx, -1);
  }
}
PlannerPlugin.prototype.moveStepDown = function(stepIdx) {
  if (stepIdx < this.items.length-1) {
    this.moveByIndex(this.items, stepIdx, 1);
  }
}

PlannerPlugin.prototype.moveByIndex = function(array, index, delta) {
  //ref: https://gist.github.com/albertein/4496103
  var newIndex = index + delta;
  if (newIndex < 0 || newIndex == array.length) return; //Already at the top or bottom.
  var indexes = [index, newIndex].sort((a, b) => a - b); //Sort the indixes (fixed)
  array.splice(indexes[0], 2, array[indexes[1]], array[indexes[0]]); //Replace from lowest index, two elements, reverting the order
}

PlannerPlugin.prototype.renderStep = function(step, stepIdx, previous) {
  var container = document.createElement('tr');
  container.className = 'plugin-planner-step';

  //src
  var src_td = container.appendChild(document.createElement('td'));
  if (!previous || llstring(previous.src) != llstring(step.src)) {
    src_td.innerHTML = this.portalTitle(this.portalFromLatlng(step.src)) || llstring(step.src)
  }
  src_td.onclick = function() { selectPortalByLatLng(step.src.lat, step.src.lng) }.bind(this);

  var actions_td = container.appendChild(document.createElement('td'));
  // action - up
  var move_up = actions_td.appendChild(document.createElement('a'));
  move_up.innerHTML = "▲"
  move_up.onclick = function() {
    this.moveStepUp(stepIdx);
    this.rerender();
  }.bind(this);

  // action - reverse
  var reverse_a = actions_td.appendChild(document.createElement('a'));
  reverse_a.innerHTML = "⇄"
  reverse_a.setAttribute('href', '#')
  reverse_a.onclick = function() {
    var tmp = step.src
    step.src = step.dest
    step.dest = tmp

    this.rerender();
  }.bind(this);

  // action - down
  var move_down = actions_td.appendChild(document.createElement('a'));
  move_down.innerHTML = "▼";
  move_down.onclick = function() {
    this.moveStepDown(stepIdx);
    this.rerender();
  }.bind(this);

  // dest
  var dest_td = container.appendChild(document.createElement('td'));
  dest_td.innerHTML = this.portalTitle(this.portalFromLatlng(step.dest)) || llstring(step.dest)
  dest_td.onclick = function() { selectPortalByLatLng(step.dest.lat, step.dest.lng) }.bind(this);

  return container;
};

PlannerPlugin.prototype.showPlannerDialog = function() {

  dialog({
    html: this.renderPlanViewer(this.items),
    height: 'auto',
    width: '400px',
    collapseCallback: this.collapseFix,
    expandCallback: this.collapseFix,
  }).dialog('option', 'buttons', {
    'OK': function() { $(this).dialog('close'); },
  });

};

PlannerPlugin.prototype.collapseFix = function() {
  if (this && this.parentNode) {
    this.parentNode.style.height = 'auto';
  }
}






// PLUGIN END //////////////////////////////////////////////////////////
var setup = PlannerPlugin.boot;

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
