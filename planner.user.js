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
 * abstract class UIComponent
      react-esque render() and setState()
      this.render() should be pure (no side effects) and return a Node
      this.state should be considered immutable except via setState()
 */
class UIComponent {
  constructor() {
    this.state = this.constructor.initialState()
    this.mount();
  }

  static initialState() {
    return {}
  }

  mount(el) {
    this.element = el || document.createElement('div') 
    this.update()
  }

  setState(newState) {
    Object.assign(this.state, newState)
    this.update()
  }

  update() {
    this.element.innerHTML = "";
    this.element.appendChild(this.render());
  }
}



/*
 * class PlanItem
 *    model class for plan step items
 */

class PlanItem {
  constructor(src, dest, srcPortal, destPortal) {
    this.src = src
    this.dest = dest
    this.srcPortal = srcPortal
    this.destPortal = destPortal
  }

  srcName() {
    if (this.srcPortal && this.srcPortal.options.data.title) {
      return this.srcPortal.options.data.title
    } 
    return llstring(this.src)
  }
  destName() {
    if (this.destPortal && this.destPortal.options.data.title) {
      return this.destPortal.options.data.title
    } 
    return llstring(this.src)
  }

  uniqid() {
    return [llstring(this.src), llstring(this.dest)].sort().join("<=>");
  }
}


/*
 * PlannerDialogStep
 *    gui class for rendering a plan step in dialog
 */
class PlannerDialogStep extends UIComponent {
  constructor(item) {
    super()
    this.item = item
  }
  render() {
    var ret = document.createElement('tr')
    var td = ret.appendChild(document.createElement('td'));
    if (this.item) {
      td.innerHTML = this.item.srcName()
    }
    return ret
  }
}


/*
 * PlannerPlugin 
 *    
 */

class PlannerPlugin extends UIComponent {
  constructor() {
    super()

    this.portal_by_guid = {};
    this.portal_by_ll = {};

    // iitc hooks
    window.addHook('portalAdded', this.handlePortalAdded.bind(this));
    window.pluginCreateHook('pluginDrawTools'); // initialize hook if needed first
    window.addHook('pluginDrawTools', this.handleDrawTools.bind(this));


    // load initial plan
    this.loadPlanFromDrawtools()


    this.setupDesktop();
    // this.setupMobile();
  }

  static initialState() {
    return {
      'items': []
    }
  }

  setupDesktop() {
    var a = $('<a tabindex="0">Planner</a>').click(this.showPlannerDialog.bind(this));
    $('#toolbox').append(a);
  }


  handlePortalAdded(data) {
    var portal = data.portal;
    var guid = portal.options.guid;
    var ll = llstring( portal._latlng );
    var title = portal.options.data.title || guid;

    // console.log("PLAN portalAdded", data.portal, title)

    this.portal_by_guid[guid] = portal
    this.portal_by_ll[ll] = portal

    var dirty = false;
    var newItems = this.state.items.map(i => {
      if (ll == llstring(i.src)) {
        i.srcPortal = portal
        dirty = true;
      }
      else if (ll == llstring(i.dest)) {
        i.destPortal = portal
        dirty = true;
      }
      return i
    })
    if (dirty) {
      this.setState({'items': newItems})
    }
  }

  handleDrawTools(payload) {
    console.log("PLAN handleDrawTools", payload)
    if (!payload) {
      return;
    }

    if (payload.event === "clear") {
      this.setState({'items': []})
    } 
    else if (payload.event === "layerCreated") {
      this.addDrawToolsLayer(payload.layer);
    }
    else if (payload.event === "layersDeleted" || payload.event === "import") {
      // TODO: we dont get notified what was deleted/imported
    }
  }


  showPlannerDialog() {

    dialog({
      title: "Planner",
      html: this.element,
      height: 'auto',
      width: '400px',
    }).dialog('option', 'buttons', {
      'OK': function() { $(this).dialog('close') },
    });

  }


  loadPlanFromDrawtools(drawToolsItems) {
    drawToolsItems = drawToolsItems || JSON.parse(localStorage['plugin-draw-tools-layer'])
    drawToolsItems.forEach(i => this.addDrawToolsLayer(i))
  }

  addDrawToolsLayer(layer) {
    var latlngs = layer.latLngs || layer._latlngs

    if (latlngs.length == 2) {
      this.addLink(latlngs[0], latlngs[1]);
    } else if (latlngs.length == 3) {
      this.addLink(latlngs[0], latlngs[1]);
      this.addLink(latlngs[0], latlngs[2]);
      this.addLink(latlngs[1], latlngs[2]);
    }
  }

  addLink (src, dest)  {
    var newItem = new PlanItem(src, dest, this.portal_by_ll[llstring(src)], this.portal_by_ll[llstring(dest)]);
    // console.log("PLAN addLink", newItem.uniqid())
    if (this.state.items.findIndex(i => i.uniqid() == newItem.uniqid()) == -1) {
      this.setState({'items': this.state.items.concat([newItem])})
    }
  }

  portalFromLatlng(latlng) {
    var ll = llstring(latlng)
    var portal = this.portal_by_ll[ll]
    return portal;
  }

  portalTitle(portal) {
    return portal ? 
      (portal.options.data.title || llstring(portal._latlng)) : 
      portal 
      ;
  }


  render() {
    var ret = document.createElement('div')

    // console.log("PLAN render", this.state)
    var steps = this.state.items.map(item => new PlannerDialogStep(item))
    steps.forEach(step => ret.appendChild(step.render()))

    return ret
  }


}

// plugin boot - called by iitc
PlannerPlugin.boot = function() {
  // console.log("PLAN boot")
  window.plugin.planner = new PlannerPlugin()
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
