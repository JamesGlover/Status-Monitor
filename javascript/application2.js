// Pivotal tracker stats analysis
/*global amplify, alert, jQuery */

(function (jQuery) { //Wrapper
  // Application wide variables
  var TIMEOUT, UPDATE_INTERVAL, RAISE_TIMEOUTS_AFTER, RAISE_ERRORS_AFTER,
  CLEAR_CAUTION_AFTER, URGENT_AFTER, URGENT_TOLERANCE, $;

  // CONFIGURATIONS ///////////////////
  // Timings (seconds)
  TIMEOUT = 8;
  UPDATE_INTERVAL = 120;

  // Report level
  RAISE_TIMEOUTS_AFTER = 0; // how many previous timeouts are required before the error is raised
  RAISE_ERRORS_AFTER = 0; // How many previous errors are required before the error is raised
  CLEAR_CAUTION_AFTER = 1; // How many success messages are needed before we return to okay
  URGENT_AFTER = 10; // How many bad events (in a row) are required before status is elevated
  URGENT_TOLERANCE = 1; // How many success events can interupt a stream and still have it flagged urgent

  $ = jQuery;

  $(function () { // jQuery Document Ready

    var Status, Group, statusarray = [], status_class = {};

    status_class = {// On return of nil, assume 'error'
      'unknown': 'unknown',
      'success': 'okay',
      'okay': 'okay',
      'abort': 'timeout',
      'caution':'caution'
    };

    // STATUS GROUPS ///////////////////////////////
    Group = function (name) { // The Group prototype
      this.name = name;
    };

    Group.prototype.core = function () {
      if (this.coreObject === undefined) {
        this.coreObject = $(document.createElement('li')).attr("id", this.snakeName() ).attr("class", "monitor_group");
        this.coreObject.append($(document.createElement('div')).attr("id", this.snakeName() + '_name').attr("class", 'group_name').text(this.name));
        this.listObject = $(document.createElement('ul')).attr('class', 'group_list');
        this.coreObject.append(this.listObject);
      }
      return this.coreObject;
    };

    Group.prototype.list = function () {
      return this.listObject;
    };

    Group.prototype.addTo = function (holder) {
      holder.append(this.core());
    };

    Group.prototype.snakeName = function () {
      return this.name.replace(/\s/g, "_");
    };

    // STATUS OBJECTS /////////////////////////////
    Status = function (group,url,name) { // The status prototype
      this.group = group;
      this.url = url;
      this.name = name;
      // And get things going
      this.render();
      this.getHistory();
      this.register();
    };

    // Initial drawing of the elements of the status object
    Status.prototype.render = function () {
      if (this.coreObject === undefined) {
        this.coreObject = $(document.createElement('li')).attr("id", this.snakeName());
        this.group.list().append(this.coreObject);
        this.coreObject.append($(document.createElement('span')).attr("id", this.snakeName('name')).attr("class", 'name').text(this.name));
        this.statusObject = $(document.createElement('span')).attr("id", this.snakeName('status')).attr("class", 'status');
        this.coreObject.append(this.statusObject);
        this.history = $(document.createElement('ul')).attr("id", this.snakeName('history')).attr("class", 'history');
        this.coreObject.append(this.history);
      }
      return this.coreObject;
    };

    // Get the stored history
    Status.prototype.getHistory = function () {
      var history_length, i, hist_el;
      this.history.data('hist', amplify.store(this.snakeName('hist')) || []);
      history_length = this.history.data('hist').length;
      while (history_length < 32) {history_length = this.history.data('hist').unshift('unknown'); }
      for (i = 0; i < history_length; i+=1) {
        hist_el = $(document.createElement('li')).attr("class", 'history_point').text("|");
        hist_el.addClass(this.stateToClass(this.history.data('hist')[i]));
        this.history.append(hist_el);
      }
    };

    // Convert states to css classes / messages
    Status.prototype.stateToClass = function (state) {
        return status_class[state] || 'error' ;
    };

    // Adds a status change to the history
    Status.prototype.addHistory = function (status) {
      this.history.data('hist').push(status);
      while (this.history.data('hist').length > 32) {
        this.history.data('hist').shift();
      }
      amplify.store(this.snakeName('hist'), this.history.data('hist'));
      this.history.children().first().remove();
      this.history.append($(document.createElement('li')).attr("class", 'history_point').text("|").addClass(this.stateToClass(status)));
    };

    // Converts the name for use in id/data storage
    Status.prototype.snakeName = function (append) {
      this.snake_name = this.snake_name || this.name.replace(/\s/g, "_").replace(/[()\/\-]/g, "");
      if (append === undefined) {
        append = '';
      } else {
        append = '_' + append;
      }
      return this.snake_name + append;
    };

    Status.prototype.request = function () {
      this.activeRequest = amplify.request({
        resourceId: this.snakeName(),
        success: this.result(),
        error: this.result()
      });
      // Once we've sent the request, set up a timeout.
      // Aborting requests causes them to fail
      setTimeout(this.timeout(), TIMEOUT * 1000);
    };

    Status.prototype.timeout = function () {
      var request = this.activeRequest;
      return function () {request.abort(); };
    };

    Status.prototype.register = function () {
      amplify.request.define(this.snakeName(), "ajax", {
        url: this.url,
        type: 'GET'
      });
      statusarray.push(this);
    };

    Status.prototype.redraw = function () {
      var target = this, status_array = ['error','okay','timeout','caution'], i;
      this.coreObject.toggleClass( 'raise', this.raised );
      for (i = 0; i < status_array.length; i += 1) {
        target.coreObject.toggleClass(status_array[i], (status_array[i] === target.state));
      }
      this.statusObject.text(this.state);
    };

    Status.prototype.persist = function (count, tolerance) {
      var i, j = 0;
      tolerance = tolerance || 0;
      for (i = 0; (i < count ); i += 1) {
        if (this.history.data('hist')[30 - i] === 'success') {
          if ( (j += 1) > tolerance) { return false; }
        }
      }
      return true;
    };

    Status.prototype.caution = function (count) {
      var i;
      for (i = 0; (i < count ); i++) {
        if (this.history.data('hist')[30 - i] !== 'success') {return true; }
      }
      return false;
    };

    Status.prototype.checkUrgent = function () {
      if (this.persist(URGENT_AFTER, URGENT_TOLERANCE)) {
        this.startUrgent();
      } else {
        this.stopUrgent();
      }
    };

    Status.prototype.stopUrgent = function () {
      clearInterval(this.urgentTimer);
      this.urgent = false;
      this.coreObject.removeClass('flash');
    };

    Status.prototype.startUrgent = function () {
      if (!this.urgent) {
        var ob = this;
        this.urgent = true;
        this.urgentTimer = setInterval(function () { ob.urgentControler(); }, 1000);
      }
    };

    Status.prototype.urgentControler = function () {
      this.coreObject.toggleClass('flash');
    };

    Status.prototype.result = function () {
      var ob = this;
/*jslint unparam: true*/
      return function (data, status) {/*jslint unparam: false*/
        ob.addHistory(status);
        switch (status) {

          case 'success':
          ob.raised = ob.caution(CLEAR_CAUTION_AFTER);
          if (ob.raised) { status = 'caution'; }
          break;

          case 'abort':
          ob.raised = ob.persist(RAISE_TIMEOUTS_AFTER);
          break;

          default:
          ob.raised = ob.persist(RAISE_ERRORS_AFTER);
          break;
        }

        //ob.raised = persistent;
        ob.checkUrgent();
        ob.state = ob.stateToClass(status);
        ob.redraw();
      };
    };

    // Browser Check
    if ((!$.browser.safari) || window.location.protocol !== 'file:') {
      alert('Due to same-domain policy issues, this page needs to be run in Safari as a local file.');
    }

    // Define Amplify requests for each JSON value
    $.getJSON('./datafiles/monitoringurls.json', function (data) {

      var i, j, group, status;

      for (i = 0; i < data.monitorGroups.length; i++) {
        group = new Group(data.monitorGroups[i].groupName);
        group.addTo($('#monitor_all'));

        for (j = 0; j < data.monitorGroups[i].monitoringUrls.length; j++) {
          status = new Status(group,data.monitorGroups[i].monitoringUrls[j].url,data.monitorGroups[i].monitoringUrls[j].name);
        }

        group.list().append('<div style="clear:both;"></div>'); // Messy hack to clear container. Setting overflow-y:auto doesn't work.
      }

      // Update controller
      function update_state() {
        var i;
        for (i = 0; i < statusarray.length; i++) { // For each item
          statusarray[i].request();
        }
      }

      update_state();
      setInterval(function () {update_state();}, UPDATE_INTERVAL * 1000);

      // CLose JSON Scope
    });
    // End Document Ready
  });
  //End wrapper
  }(jQuery));