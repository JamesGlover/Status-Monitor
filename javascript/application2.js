// Pivotal tracker stats analysis

(function (jQuery) { //Wrapper
  // Application wide variables
  var TIMEOUT, UPDATE_INTERVAL, RAISE_TIMEOUTS_AFTER, RAISE_ERRORS_AFTER, CLEAR_CAUTION_AFTER, $;

  // CONFIGURATIONS ///////////////////
  // Timings (seconds)
  TIMEOUT = 8;
  UPDATE_INTERVAL = 120;

  // Report level
  RAISE_TIMEOUTS_AFTER = 0; // how many previous timeouts are required before the error is raised
  RAISE_ERRORS_AFTER = 0; // How many previous errors are required before the error is raised
  CLEAR_CAUTION_AFTER = 1; // How many success messages are needed before we return to okay

  $ = jQuery;

  $(function () { // jQuery Document Ready

    var namearray = [], monitor = {};

    // Browser Check

    if ((!$.browser.safari) || window.location.protocol !== 'file:') {
      alert('Due to same-domain policy issues, this page needs to be run in Safari as a local file.');
    }

    // Define Amplify requests for each JSON value
    $.getJSON('./datafiles/monitoringurls.json', function (data) {

      var holder, i, j, group, glist, snake_name, item, url, name, l, history, k, hist_el;
      holder = $('#monitor_all');
      for (i = 0; i < data.monitorGroups.length; i++) {
        group = $(document.createElement('li')).attr("id", data.monitorGroups[i].groupName.replace(/\s/g, "_")).attr("class", "monitor_group");
        holder.append(group);
        group.append($(document.createElement('div')).attr("id", data.monitorGroups[i].groupName.replace(/\s/g, "_") + '_name').attr("class", 'group_name').text(data.monitorGroups[i].groupName));
        glist = $(document.createElement('ul')).attr('class', 'group_list');
        group.append(glist);
        for (j = 0; j < data.monitorGroups[i].monitoringUrls.length; j++) {
          snake_name = data.monitorGroups[i].monitoringUrls[j].name.replace(/\s/g, "_").replace(/[()\/\-]/g, "");
          item = $(document.createElement('li')).attr("id", snake_name);
          glist.append(item);
          item.append($(document.createElement('span')).attr("id", snake_name + '_name').attr("class", 'name').text(data.monitorGroups[i].monitoringUrls[j].name));
          item.append($(document.createElement('span')).attr("id", snake_name + '_status').attr("class", 'status'));
          history = $(document.createElement('ul')).attr("id", snake_name + '_history').attr("class", 'history');
          item.append(history);
          url = data.monitorGroups[i].monitoringUrls[j].url;
          name = data.monitorGroups[i].monitoringUrls[j].name;
          namearray.push(snake_name);
          item.data('hist', amplify.store(snake_name + '_hist') || []);
          l = item.data('hist').length;
          while (l < 32) {l = item.data('hist').unshift('unknown'); }
          for (k = 0; k < l; k++) {
            hist_el = $(document.createElement('li')).attr("class", 'history_point').text("|")
            switch (item.data('hist')[k]) {

            case 'unknown':
              hist_el.addClass('unknown');
              break; 
            case 'success':
              hist_el.addClass('success');
              break;
            case 'abort':
              hist_el.addClass('timeout');
              break;
            default:
              hist_el.addClass('fail');
              break;
              
            }
            history.append(hist_el);
          }
          amplify.request.define(snake_name, "ajax", {
            url: url,
            type: 'GET'
          });
        }
        group.append('<div style="clear:both;"></div>'); // Messy hack to clear container. Setting overflow-y:auto doesn't work.
      }

      function in_scope_success(name) {
        return function (data, status) {
          var item, caution, i, stat, history;
          item = $('#' + name);
          stat = $('#' + name + '_status');
          history = $('#' + name + '_history');
          item.data('hist').push(status);
          while (item.data('hist').length > 32) {item.data('hist').shift(); }
          amplify.store(name + '_hist', item.data('hist'));
          caution = false;
          history.children().first().remove()
          history.append($(document.createElement('li')).attr("class", 'history_point').text("|").addClass('success'))

          for (i = 0; (i < CLEAR_CAUTION_AFTER && caution === false); i++) {
            if (item.data('hist')[30 - i] !== 'success') {caution = true; }
          }
          if (caution) {
            item.removeClass('fail');
            item.removeClass('success');
            item.removeClass('timeout');
            item.addClass('caution');
            item.addClass('raise');
            stat.text('Caution');
          } else {
            item.removeClass('fail');
            item.addClass('success');
            item.removeClass('timeout');
            item.removeClass('caution');
            item.removeClass('raise');
            stat.text('Okay');
          }
        };
      }

      function in_scope_fail(name) {
        return function (data, status) {

          var item, stat, i, persistent, history;
          item = $('#' + name);
          stat = $('#' + name + '_status');
          history = $('#' + name + '_history');
          item.data('hist').push(status);
          while (item.data('hist').length > 32) {item.data('hist').shift(); } // Keep 32 in the history
          amplify.store(name + '_hist', item.data('hist'));
          switch (status) {

          case 'abort':
            persistent = true;
            history.children().first().remove()
            history.append($(document.createElement('li')).attr("class", 'history_point').text("|").addClass('timeout'))
            
            for (i = 0; (i < RAISE_TIMEOUTS_AFTER && persistent === true); i++) {
              if (item.data('hist')[30 - i] === 'success') {persistent = false; }
            }
            item.removeClass('fail');
            item.removeClass('success');
            item.addClass('timeout');
            item.removeClass('caution');
            if (persistent) {
              item.addClass('raise');
            } else {
              item.removeClass('raise');
            }
            stat.text('Timeout');
            break;

          case 'error':
          case 'fail':
          default:
            persistent = true;
            history.children().first().remove()
            history.append($(document.createElement('li')).attr("class", 'history_point').text("|").addClass('fail'))
            
            for (i = 0; (i < RAISE_TIMEOUTS_AFTER && persistent === true); i++) {
              if (item.data('hist')[30 - i] === 'success') {persistent = false; }
            }
            item.addClass('fail');
            item.removeClass('success');
            item.removeClass('timeout');
            item.removeClass('caution');
            if (persistent) {
              item.addClass('raise');
            } else {
              item.removeClass('raise');
            }
            stat.text(status);
            break;
          }
        };
      }

      function timeout(request) {
        return function () {request.abort(); };
      }

      // Make requests and update display
      function update_state() {
        var i, request;

        for (i = 0; i < namearray.length; i++) { // For each item

          request = amplify.request({
            resourceId: namearray[i],
            success: in_scope_success(namearray[i]),
            error: in_scope_fail(namearray[i])
          });

          // Once we've sent the request, set up a timeout.
          // Aborting requests causes them to fail
          setTimeout(timeout(request), TIMEOUT * 1000);

        }
      }

      update_state();
      setInterval(function () {update_state();}, UPDATE_INTERVAL * 1000);

      // CLose JSON Scope
    });
    // End Document Ready
  });
  //End wrapper
})(jQuery);