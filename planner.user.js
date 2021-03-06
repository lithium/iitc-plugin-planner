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

var moveByIndex = function(array, index, delta) {
  //ref: https://gist.github.com/albertein/4496103
  var newIndex = index + delta;
  if (newIndex < 0 || newIndex == array.length) return; //Already at the top or bottom.
  var indexes = [index, newIndex].sort((a, b) => a - b); //Sort the indixes (fixed)
  array.splice(indexes[0], 2, array[indexes[1]], array[indexes[0]]); //Replace from lowest index, two elements, reverting the order
}

var distinct = function(value, index, self) {
  return self.indexOf(value) === index;
}
var defined = function(x) { return x !== undefined }
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
  constructor(options) {
    this.src = options.src
    this.dest = options.dest
    this.srcPortal = options.srcPortal
    this.destPortal = options.destPortal
    this.srcLayerId = options.srcLayerId
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

  reverse() {
    var tmp = this.dest
    var tmpPortal = this.destPortal
    this.dest = this.src
    this.destPortal = this.srcPortal
    this.src = tmp
    this.srcPortal = tmPortal
  }

  get llsrc() {
    return llstring(this.src)
  }
  get lldest() {
    return llstring(this.dest)
  }

  get srcLayer() {
    return plugin.drawTools.drawnItems.getLayer(this.srcLayerId)
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

      if (this.props.handlePortalClick) {
        src.onclick = () => this.props.handlePortalClick(this.props.item.src, this.props.item.srcPortal)
        dest.onclick = () => this.props.handlePortalClick(this.props.item.dest, this.props.item.destPortal)
      }
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
      'activeTab': 'steps',
    }
  }

  setupDesktop() {
    var a = $('<a tabindex="0">Planner</a>').click(this.showPlannerDialog.bind(this));
    $('#toolbox').append(a);
  }

  handleCloseDialog() {
    this.dialog = undefined
  }

  showPlannerDialog() {
    if (this.dialog) {
      return;
    }

    this.setState({})

    this.dialog = dialog({
      title: "Planner",
      html: this.element,
      height: 'auto',
      width: '400px',
      closeCallback: () => this.handleCloseDialog()
    }).dialog('option', 'buttons', {
      'OK': function() { $(this).dialog('close') },
    });

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
    else if (payload.event === "layersDeleted") {
      var layers = window.plugin.drawTools.drawnItems.getLayers()
      var validIds = layers.map(l => l._leaflet_id)
      var newItems = this.state.items.filter(i => validIds.indexOf(i.srcLayerId) != -1)
      this.setState({
        'items': newItems
      })

    }
    else if (payload.event === "import") {
      this.setState({'items': []})
      this.loadPlanFromDrawtools()
    }
    else if (payload.event === "layersSnappedToPortals" || payload.event === "layersEdited") {
    }
  }

  loadPlanFromDrawtools() {
    var layers = window.plugin.drawTools.drawnItems.getLayers()
    layers.forEach(l => this.addDrawToolsLayer(l))
  }

  addDrawToolsLayer(layer) {
    var latlngs = layer.getLatLngs()

    if (latlngs.length == 2) {
      this.addLink(latlngs[0], latlngs[1], layer);
    } else if (latlngs.length == 3) {
      this.addLink(latlngs[0], latlngs[1], layer);
      this.addLink(latlngs[0], latlngs[2], layer);
      this.addLink(latlngs[1], latlngs[2], layer);
    }
  }

  addLink (src, dest, srcLayer)  {
    var newItem = new PlanItem({
      src: src, 
      dest: dest, 
      srcPortal: this.portal_by_ll[llstring(src)], 
      destPortal: this.portal_by_ll[llstring(dest)],
      srcLayerId: srcLayer._leaflet_id
    });
    // console.log("PLAN addLink", newItem.uniqid())
    if (this.state.items.findIndex(i => i.uniqid() == newItem.uniqid()) == -1) {
      this.setState({'items': this.state.items.concat([newItem])})
    }
  }

  sortBySource() {
    this.setState({
      items: this.state.items.concat().sort((a, b) => a.llsrc.localeCompare(b.llsrc))
    })
  }

  reverseSelected() {
    this.setState({
      items: this.state.items.map(i => {
        if (this.state.selected[i.uniqid()] === true) {
          return new PlanItem({
            src: i.dest, 
            dest: i.src, 
            srcPortal: i.destPortal, 
            destPortal: i.srcPortal,
            srcLayerId: i.srcLayerId
          })
        } else {
          return i
        }
      })
    })
  }

  moveSelected(delta) {
    var newItems = this.state.items.concat()
    Object.getOwnPropertyNames(this.state.selected).forEach(id => {
      var idx = newItems.findIndex(i => i.uniqid() == id)
      if (idx != -1) 
        moveByIndex(newItems, idx, delta)
    })

    this.setState({
      items: newItems
    })
  }

  get selectedCount() {
    return Object.getOwnPropertyNames(this.state.selected).length
  }

  render() {
    var ret = document.createElement('div')

    ret.appendChild(this.renderTabs());

    if (this.state.activeTab == 'steps') {
      ret.appendChild(this.renderStepsTab())
    } 
    else if (this.state.activeTab == 'portals') {
      ret.appendChild(this.renderPortalsTab())
    }


    return ret
  }
  renderTabs() {
    var ret = document.createElement('div')
    var stepsBtn = $('<button>Steps</button>').click(() => this.setState({'activeTab': 'steps'}))
    var portalsBtn = $('<button>Portals</button>').click(() => this.setState({'activeTab': 'portals'}))
    ret.appendChild(stepsBtn[0])
    ret.appendChild(portalsBtn[0])
    return ret
  }
  renderPortalsTab() {
    var ret = document.createElement('div')

    var destPortals = this.state.items.map(item => item.destPortal).filter(defined)
    var keyCounts = destPortals.reduce((acc, val) => {
      var key = val.options.guid
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    var table = $('<table><tr><th>Portal</th><th>Required</th><th>Have</th><th>Need</th></tr></table>')
    destPortals.filter(distinct).sort((a,b) => a.options.data.title.localeCompare(b.options.data.title)).forEach(portal => {
      var row = $('<tr></tr>')
      var req = keyCounts[portal.options.guid]
      var have = plugin.keys ? plugin.keys.keys[portal.options.guid] : undefined || 0
      var need = req - have
      row.append(`<td>${portal.options.data.title}</td>`)
      row.append(`<td>${req}</td>`)
      row.append(`<td>${have}</td>`)
      row.append(`<td>${need}</td>`)

      table.append(row)
    })
      ret.appendChild(table[0])
    return ret
  }
  renderStepsTab() {
    var ret = document.createElement('div')


    var actions = ret.appendChild(document.createElement('div'));
    var reverse_a = actions.appendChild(document.createElement('a'));
    reverse_a.innerHTML = "⇄"
    reverse_a.onclick = () => this.reverseSelected()

    var moveup_a = actions.appendChild(document.createElement('a'));
    moveup_a.innerHTML = "▲"
    moveup_a.onclick = () => this.moveSelected(-1)

    var movedown_a = actions.appendChild(document.createElement('a'));
    movedown_a.innerHTML = "▼"
    movedown_a.onclick = () => this.moveSelected(1)

    var table = ret.appendChild(document.createElement('table'));

    var head = table.appendChild(document.createElement('tr'))
    var check_th = head.appendChild(document.createElement('th'))
    var check = check_th.appendChild(document.createElement('input'))
    check.setAttribute('type', 'checkbox')
    if (this.selectedCount > 0)
      check.setAttribute('checked', 'checked')
    check.onclick = () => {
      this.selectItems(0, this.state.items.length, check.checked)
    }

    var src_th = head.appendChild(document.createElement('th'))
    src_th.innerHTML = "Source"
    src_th.onclick = () => this.sortBySource()

    var dest_th = head.appendChild(document.createElement('th'))
    dest_th.innerHTML = "Destination"

    var steps = this.state.items.map((item, idx) => new PlannerDialogStep({
      stepNumber: idx,
      item: item,
      previousItem: idx > 0 ? this.state.items[idx-1] : undefined,
      handleClick: (evt) => { 
        if (evt.shiftKey && this.lastClickedIdx !== undefined) {
          var start = Math.min(this.lastClickedIdx, idx)
          var end = Math.max(this.lastClickedIdx, idx)
          this.selectItems(start, end-start+1, evt.target.checked)
        } else {
          this.selectItems(idx, 1, evt.target.checked)
        }
        this.lastClickedIdx = idx;
      },
      handlePortalClick: (latlng, portal) => {
        selectPortalByLatLng(latlng.lat, latlng.lng)
      },
      checked: this.state.selected[item.uniqid()] === true,
    }))
    steps.forEach(step => table.appendChild(step.render()))

    return ret
  }

  selectItems(start, count, checked) {
    var selectIds = this.state.items.slice(start, start+count).map(i => i.uniqid())
    var newSelected = Object.assign({}, this.state.selected)
    selectIds.forEach(id => {
      if (checked) 
        newSelected[id] = true
      else
        delete newSelected[id]
    }) 
    this.setState({'selected': newSelected})
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
