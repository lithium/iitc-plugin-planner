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
  constructor(properties) {
    this.props = Object.assign(this.constructor.defaultProps(), properties)
    this.state = this.constructor.initialState()
    this.mount();
  }

  static initialState() {
    return {}
  }

  static defaultProps() {
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

  get llsrc() {
    return llstring(this.src)
  }
  get lldest() {
    return llstring(this.dest)
  }
}


/*
 * PlannerDialogStep
 *    gui class for rendering a plan step in dialog
 */
class PlannerDialogStep extends UIComponent {
  render() {
    var ret = document.createElement('tr')
    if (this.props.item) {
      var td = ret.appendChild(document.createElement('td'));
      var check = td.appendChild(document.createElement('input'))
      check.setAttribute('type', 'checkbox')
      if (this.props.checked) 
        check.setAttribute('checked', 'checked')
      check.onclick = this.props.handleClick

      if (this.props.stepNumber !== undefined) {
        var no = td.appendChild(document.createElement('span'))
        no.innerHTML = `${this.props.stepNumber+1}.`
      }

      var src = ret.appendChild(document.createElement('td'));
      if (!this.props.previousItem || this.props.previousItem.llsrc != this.props.item.llsrc)
        src.innerHTML = this.props.item.srcName()

      var dest = ret.appendChild(document.createElement('td'));
      dest.innerHTML = this.props.item.destName()
    }
    return ret
  }
}


/*
 * PlannerPlugin 
 *    
 */

class PlannerPlugin extends UIComponent {
  constructor(props) {
    super(props)

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
      'items': [],
      'selected': {},
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
    if (this.dialog) {
      return;
    }

    this.dialog = dialog({
      title: "Planner",
      html: this.element,
      height: 'auto',
      width: '400px',
      closeCallback: () => this.dialog = undefined
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


  sortBySource() {
    this.setState({
      items: this.state.items.concat().sort((a, b) => a.llsrc.localeCompare(b.llsrc))
    })
  }

  render() {
    var ret = document.createElement('div')

    var table = ret.appendChild(document.createElement('table'));

    var head = table.appendChild(document.createElement('tr'))
    var check_th = head.appendChild(document.createElement('th'))
    var check = check_th.appendChild(document.createElement('input'))
    check.setAttribute('type', 'checkbox')
    if (this.state.allSelected === true) 
      check.setAttribute('checked', 'checked')
    check.onclick = () => {
      var allids = this.state.items.map(i => i.uniqid())
      var allselected = allids.reduce((acc,cur) => {
        acc[cur] = true
        return acc
      }, {})
      this.setState({
        'allSelected': check.checked,
        'selected': check.checked ? allselected : {},
      })
    }

    var src_th = head.appendChild(document.createElement('th'))
    src_th.innerHTML = "Source"
    src_th.onclick = () => this.sortBySource()

    var dest_th = head.appendChild(document.createElement('th'))
    dest_th.innerHTML = "Destination"

    // console.log("PLAN render", this.state)
    var steps = this.state.items.map((item, idx) => new PlannerDialogStep({
      stepNumber: idx,
      item: item,
      previousItem: idx > 0 ? this.state.items[idx-1] : undefined,
      handleClick: (evt) => { 
        var newSelected = Object.assign({}, this.state.selected)
        if (evt.target.checked) {
          newSelected[item.uniqid()] = true;
        } else {
          delete newSelected[item.uniqid()];
        }

        this.setState({
          allSelected: false, 
          selected: newSelected
        })
      },
      checked: this.state.selected[item.uniqid()] === true,
    }))
    steps.forEach(step => table.appendChild(step.render()))

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
