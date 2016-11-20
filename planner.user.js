// ==UserScript==
// @id             iitc-plugin-planner@nobody889
// @name           IITC plugin: Planner
// @category       Info
// @version        0.2.0
// @namespace      https://github.com/lithium/iitc-plugin-planner
// @updateURL      @@UPDATEURL@@
// @downloadURL    @@DOWNLOADURL@@
// @description    [@@BUILDNAME@@-@@BUILDDATE@@] Build plans with drawtools
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @include        https://www.ingress.com/mission/*
// @include        http://www.ingress.com/mission/*
// @match          https://www.ingress.com/mission/*
// @match          http://www.ingress.com/mission/*
// @grant          none
// ==/UserScript==


function wrapper(plugin_info) {
// ensure plugin framework is there, even if iitc is not yet loaded
if(typeof window.plugin !== 'function') window.plugin = function() {};




// PLUGIN START ////////////////////////////////////////////////////////


window.plugin.planner = function() {};

window.plugin.planner.setup = function() {


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
    addHook('paneChanged', this.onPaneChanged.bind(this));

  }

};

window.plugin.planner.renderPlanViewer = function(plan) {
  var container = document.createElement('div');
  var currentPlan = window.plugin.planner.currentPlan;

  plan.steps.forEach(function(step) {
    container.appendChild(this.renderStep(step));
  }, this);

  return container;
};

window.plugin.planner.renderStep = function(step) {
  var container = document.createElement('div');
  container.className = 'plugin-planner-step';

  var p = container.appendChild(document.createElement('p'));
  p.className = 'plugin-planner-step-name';
  p.innerHTML = step.name;

  return container;
};

window.plugin.planner.showPlannerDialog = function() {
  var plan = {
    steps: [
      {
        name: "hello world"
      }
    ]

  };

  dialog({
    html: this.renderPlanViewer(plan),
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

window.plugin.planner.onPaneChanged = function(pane) {
  if(pane == 'plugin-planner') {
    document.body.appendChild(this.mobilePane);
  } else if(this.mobilePane.parentNode) {
    this.mobilePane.parentNode.removeChild(this.mobilePane);
  }
};




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


