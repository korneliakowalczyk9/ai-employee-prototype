/* Aria: first task. A small interactive prototype of handing a first task to an AI employee.
   Plain JavaScript. No backend, no tracking, no network calls. All data is fictional and lives in this file.
   Reload the page to start again. */
(function () {
  'use strict';

  // ----- Fictional data -----
  var REQUESTS = [
    { n: 1, who: 'Lena Brandt', what: 'Q3 expense report: please confirm', urgent: true, draft: 'lena' },
    { n: 2, who: 'Sam Okafor', what: 'Office move walkthrough on Friday', urgent: true, draft: 'sam' },
    { n: 3, who: 'Priya Nair', what: 'Printer on floor 2 is offline' },
    { n: 4, who: 'Tomasz Wieck', what: 'New laptop order: approval', draft: 'tomasz' },
    { n: 5, who: 'Marcus Lindqvist', what: 'Update the meeting room booking rules' },
    { n: 6, who: 'Hannah Cole', what: 'Welcome pack for the new starter' },
    { n: 7, who: 'Diego Ramos', what: 'Holiday calendar for next year is attached' },
    { n: 8, who: 'Aisha Rahman', what: 'Friday team lunch moved to 13:00' },
    { n: 9, who: 'Ava Moreno', what: 'Newsletter ideas for next month', draft: 'ava' },
    { n: 10, who: 'Jonas Weber', what: 'Second monitor has arrived' },
    { n: 11, who: 'Elena Petrova', what: 'Feedback on the onboarding checklist' },
    { n: 12, who: 'Oliver Grant', what: 'Recycling bins near the kitchen' }
  ];

  // Draft cards are shown in this order. Only Lena and Sam can be sent.
  var DRAFT_ORDER = ['lena', 'sam', 'tomasz', 'ava'];
  var DRAFTS = {
    lena: {
      name: 'Lena Brandt', rank: 1, urgent: true, sendable: true,
      request: 'Please confirm you received the Q3 expense report. The audit closes on Monday.',
      text: 'Hi Lena, I have received the Q3 expense report, thank you. I will review it by the end of the week.'
    },
    sam: {
      name: 'Sam Okafor', rank: 2, urgent: true, sendable: true,
      request: 'Could we book the office move walkthrough for Friday at 10:00?',
      text: 'Hi Sam, thanks for asking. The walkthrough is confirmed for Thursday at 10:00. I will send a calendar invite.'
    },
    tomasz: {
      name: 'Tomasz Wieck', rank: 4, urgent: false, sendable: false,
      request: 'Can I get approval for the new laptop order? The quote is attached.',
      text: 'Hi Tomasz, thanks for the quote. I need to check the budget first and will reply tomorrow.'
    },
    ava: {
      name: 'Ava Moreno', rank: 9, urgent: false, sendable: false,
      request: "I have three ideas for next month's newsletter. Can we talk next week?",
      text: "Hi Ava, thanks for the ideas. Let's talk early next week."
    }
  };

  var STAGE_SECONDS = { plan: 5, sort: 10, draft: 10, stop: 3, notNow: 5 };

  // ----- State -----
  var s = {
    screen: 'task',        // task | plan | sort | draft | paused | results | edit | summary
    modal: null,           // null | access | notNow | send
    granted: false,
    notNowUsed: false,
    countdown: 0,
    pending: null,         // null | sort | draft (a stop has been requested in this stage)
    stopEarlier: false,
    stopLast: false,
    resumed: false,
    editing: null,
    sending: null,
    sent: [],              // draft keys in the order they were sent
    texts: {},
    minute: 1,
    log: []
  };
  Object.keys(DRAFTS).forEach(function (k) { s.texts[k] = DRAFTS[k].text; });

  var timer = null;
  var lastFocus = null;

  var $main = document.getElementById('main');
  var $announce = document.getElementById('announce');
  var $overlay = document.getElementById('overlay');
  var $steps = document.getElementById('steps');
  var $log = document.getElementById('log');
  var $chips = document.getElementById('chips');
  var $progress = document.getElementById('progress-panel');

  // ----- Helpers -----
  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clock() { return '10:' + (s.minute < 10 ? '0' : '') + s.minute; }
  function addLog(text) { s.log.push({ time: clock(), text: text }); }
  function setTimer(fn, seconds) { clearTimer(); timer = setTimeout(fn, seconds * 1000); }
  function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
  function isSent(k) { return s.sent.indexOf(k) !== -1; }
  function firstName(k) { return DRAFTS[k].name; }

  // ----- Flow -----
  function openAccess() { s.modal = 'access'; render(true); }

  function notNow() {
    s.modal = 'notNow';
    s.notNowUsed = true;
    s.countdown = STAGE_SECONDS.notNow;
    render(true);
    clearTimer();
    (function tick() {
      timer = setTimeout(function () {
        s.countdown -= 1;
        if (s.countdown <= 0) { backToTask(); } else { render(false); tick(); }
      }, 1000);
    })();
  }

  function backToTask() {
    clearTimer();
    s.modal = null;
    s.screen = 'task';
    render(true);
  }

  function grant() {
    s.granted = true;
    s.modal = null;
    s.screen = 'plan';
    s.minute = 1;
    addLog('Access granted: Requests inbox and Weekly planning board.');
    render(true);
    setTimer(startSort, STAGE_SECONDS.plan);
  }

  function startSort() {
    s.minute = 1;
    addLog('Read 12 requests and 5 board cards.');
    s.minute = 2;
    addLog('Started sorting and flagging.');
    s.screen = 'sort';
    s.pending = null;
    render(true);
    setTimer(finishSort, STAGE_SECONDS.sort);
  }

  function finishSort() {
    s.minute = 3;
    addLog('Sorted 12 requests and flagged 2 as urgent.');
    startDraft();
  }

  function startDraft() {
    s.minute = s.resumed ? 4 : 3;
    addLog('Started writing draft replies.');
    s.screen = 'draft';
    s.pending = null;
    render(true);
    setTimer(finishDraft, STAGE_SECONDS.draft);
  }

  function finishDraft() {
    if (s.stopLast) {
      s.minute += 1;
      addLog('Wrote 4 draft replies. The stop took effect at the end of the last stage. None are sent.');
    } else {
      s.minute = s.resumed ? 5 : 3;
      addLog('Wrote 4 draft replies. None are sent.');
    }
    s.screen = 'results';
    s.pending = null;
    render(true);
  }

  function stop() {
    if (s.pending) { return; }
    if (s.screen === 'sort') {
      s.stopEarlier = true;
      s.pending = 'sort';
      s.minute = 2;
      addLog('You asked to stop.');
      render(false);
      setTimer(function () {
        s.minute = 3;
        addLog('Sorted 12 requests and flagged 2 as urgent.');
        addLog('Paused after Sort and flag.');
        s.screen = 'paused';
        s.pending = null;
        render(true);
      }, STAGE_SECONDS.stop);
    } else if (s.screen === 'draft') {
      s.stopLast = true;
      s.pending = 'draft';
      s.minute = s.resumed ? 5 : 4;
      addLog('You asked to stop. It takes effect after the drafts are written.');
      render(false);
      setTimer(finishDraft, STAGE_SECONDS.stop);
    }
  }

  function resume() {
    s.minute = 4;
    addLog('You resumed the work.');
    s.resumed = true;
    startDraft();
  }

  function openEdit(k) { s.editing = k; s.screen = 'edit'; render(true); }

  function saveEdit(k, value) {
    var v = value.trim();
    if (!v) { return; }
    if (v !== s.texts[k]) {
      s.texts[k] = v;
      s.minute += 1;
      addLog('You edited the draft reply to ' + DRAFTS[k].name + '.');
    }
    s.editing = null;
    s.screen = 'results';
    render(true);
  }

  function cancelEdit() { s.editing = null; s.screen = 'results'; render(true); }

  function openSend(k) {
    if (isSent(k) || !DRAFTS[k].sendable) { return; }
    lastFocus = k;
    s.sending = k;
    s.modal = 'send';
    render(true);
  }

  function closeSend() {
    s.sending = null;
    s.modal = null;
    render(false);
    var back = lastFocus && document.querySelector('[data-act="send"][data-k="' + lastFocus + '"]');
    if (back) { back.focus(); }
  }

  function authorise() {
    var k = s.sending;
    if (!k || isSent(k)) { return; }
    s.minute += 1;
    addLog('You authorised sending to ' + DRAFTS[k].name + '.');
    addLog('Sent the reply to ' + DRAFTS[k].name + ' (simulated).');
    s.sent.push(k);
    s.sending = null;
    s.modal = null;
    render(false);
    var tag = document.getElementById('sent-' + k);
    if (tag) { tag.setAttribute('tabindex', '-1'); tag.focus(); }
  }

  function openSummary() { s.screen = 'summary'; render(true); }
  function backToResults() { s.screen = 'results'; render(true); }

  // ----- Rendering -----
  function stepStates() {
    switch (s.screen) {
      case 'plan': return [['Next', ''], ['Next', ''], ['Next', '']];
      case 'sort': return [['Done', ''], ['In progress', 'now'], ['Next', '']];
      case 'draft': return [['Done', ''], ['Done', ''], ['In progress', 'now']];
      case 'paused': return [['Done', ''], ['Done', ''], ['Not started', '']];
      default: return [['Done', ''], ['Done', ''], ['Done', '']];
    }
  }

  function renderRail() {
    var showProgress = s.granted;
    $progress.hidden = !showProgress;
    if (showProgress) {
      var names = ['1  Read', '2  Sort and flag', '3  Draft'];
      $steps.innerHTML = stepStates().map(function (st, i) {
        return '<li class="' + st[1] + '"><span>' + esc(names[i]) + '</span><span class="state">' + esc(st[0]) + '</span></li>';
      }).join('');
    }
    var entries = s.log.slice();
    if (s.stopEarlier || s.stopLast) {
      // The stop marker sits under the first line, as in the wireframes.
      if (s.pending) { entries.splice(Math.min(1, entries.length), 0, { marker: 'Stop requested' }); }
    }
    $log.innerHTML = entries.map(function (e) {
      if (e.marker) { return '<li><span class="marker">' + esc(e.marker) + '</span></li>'; }
      return '<li><span class="time">' + esc(e.time) + '</span>' + esc(e.text) + '</li>';
    }).join('') || '<li class="muted">Nothing yet.</li>';
  }

  function renderChips() {
    if (s.granted) {
      $chips.innerHTML = '<span class="chip">Inbox: Requests inbox (Northwind Studio)</span><span class="chip">Board: Weekly planning board</span>';
    } else if (s.notNowUsed) {
      $chips.innerHTML = '<span class="chip off">Access: not granted</span>';
    } else {
      $chips.innerHTML = '';
    }
  }

  function limitsCards() {
    return '<div class="two-col">' +
      '<div class="card"><h2 class="sub" style="margin-top:0">What I will do</h2><ul>' +
      '<li>Read one inbox and one board that you choose</li>' +
      '<li>Sort the requests and flag the urgent ones</li>' +
      '<li>Write draft replies that only you can see</li></ul></div>' +
      '<div class="card"><h2 class="sub" style="margin-top:0">What I will not do</h2><ul>' +
      '<li>Delete or change anything that already exists</li>' +
      '<li>Spend any money</li>' +
      '<li>Share anything outside the company</li></ul></div></div>' +
      '<p class="note-line">Nothing is sent without your approval.</p>';
  }

  function viewTask() {
    var banner = s.notNowUsed
      ? '<div class="banner" role="status">Access not granted. I have not read anything and I have not started any work.</div>'
      : '';
    var label = s.notNowUsed ? 'Request access again' : 'Continue';
    return banner +
      '<h1>Your first task</h1>' +
      '<p class="lead">Sort this week\'s requests, flag the urgent ones, and write replies for you to review.</p>' +
      '<h2 class="sub">Triage this week\'s requests</h2>' +
      limitsCards() +
      '<div class="btn-row"><button class="btn" type="button" data-act="open-access">' + label + '</button></div>';
  }

  function viewPlan() {
    return '<h1>My plan</h1>' +
      '<h2 class="sub">Here is what I will do</h2>' +
      '<ol class="summary-list">' +
      '<li>Read the inbox and the board.</li>' +
      '<li>Sort the requests and flag the urgent ones.</li>' +
      '<li>Write draft replies for selected requests. Drafts stay private.</li></ol>' +
      '<p class="note-line">I am starting now. You do not need to click anything.</p>';
  }

  function viewWork() {
    var sort = s.screen === 'sort';
    var title = sort ? 'Working: sort and flag' : 'Working: write drafts';
    var now = sort ? 'Sorting 12 requests by how urgent they are.' : 'Writing 4 draft replies.';
    var checkpoint, stopBlock;
    if (sort) {
      checkpoint = s.pending ? 'Will pause after Sort and flag.' : 'Checkpoint after each stage.';
      stopBlock = s.pending
        ? '<p class="banner" role="status">Stop requested. It will take effect at the next checkpoint, so it may not be instant.</p>'
        : '<div class="btn-row"><button class="btn btn-secondary" type="button" data-act="stop">Stop</button></div>' +
          '<p class="hint">I will pause at the next checkpoint, after the current stage.</p>';
    } else {
      checkpoint = s.pending ? 'Last stage. The stop takes effect when it ends.' : 'Checkpoint after each stage.';
      stopBlock = s.pending
        ? '<p class="banner" role="status">Stop requested. The next checkpoint is the end of this last stage, so I will finish writing the drafts first. Nothing will be sent.</p>'
        : '<div class="btn-row"><button class="btn btn-secondary" type="button" data-act="stop">Stop</button></div>' +
          '<p class="hint">This is the last stage. A stop takes effect when it ends.</p>';
    }
    return '<h1>' + title + '</h1>' +
      '<div class="now-card"><div class="label">Now</div><p>' + now + '</p><p class="hint">' + checkpoint + '</p></div>' +
      stopBlock;
  }

  function viewPaused() {
    return '<h1>Paused after Sort and flag</h1>' +
      '<div class="now-card"><div class="label">Where things stand</div>' +
      '<p>I sorted 12 requests and flagged 2 as urgent. I have not written any drafts yet.</p>' +
      '<p class="hint">Paused at the checkpoint after Sort and flag.</p></div>' +
      '<div class="btn-row"><button class="btn" type="button" data-act="resume">Resume work</button></div>' +
      '<p class="hint">Work will resume from the next stage. Completed steps will not be repeated.</p>';
  }

  function viewResults() {
    var rows = REQUESTS.map(function (r) {
      var tags = '';
      if (r.urgent) { tags += '<span class="tag urgent">Urgent</span>'; }
      if (r.draft) {
        tags += isSent(r.draft)
          ? '<span class="tag sent">Sent</span>'
          : '<span class="tag draft">Draft ready</span>';
      }
      return '<li><span class="n">' + r.n + '</span><span class="who">' + esc(r.who) + '</span>' +
        '<span class="what">' + esc(r.what) + '</span><span class="tags">' + tags + '</span></li>';
    }).join('');

    var cards = DRAFT_ORDER.map(function (k) {
      var d = DRAFTS[k];
      var sent = isSent(k);
      var tag = sent
        ? '<span class="tag sent" id="sent-' + k + '">Sent (simulated)</span>'
        : '<span class="tag">Not sent</span>';
      var foot;
      if (sent) {
        foot = tag;
      } else if (d.sendable) {
        foot = '<button class="btn btn-secondary" type="button" data-act="edit" data-k="' + k + '" aria-label="Edit the draft reply to ' + esc(d.name) + '">Edit</button>' +
          '<button class="btn" type="button" data-act="send" data-k="' + k + '" aria-label="Send the reply to ' + esc(d.name) + '">Send</button>' + tag;
      } else {
        foot = '<button class="btn btn-secondary" type="button" data-act="edit" data-k="' + k + '" aria-label="Edit the draft reply to ' + esc(d.name) + '">Edit</button>' + tag +
          '<span class="hint">Sending is not available for this draft.</span>';
      }
      return '<article class="card draft"><div class="head"><h3>' + esc(d.name) + '</h3><span class="rank">#' + d.rank + (d.urgent ? ' · Urgent' : '') + '</span></div>' +
        '<div class="label">Request</div><p class="body">' + esc(d.request) + '</p>' +
        '<div class="label">Draft reply</div><p class="body">' + esc(s.texts[k]) + '</p>' +
        '<div class="foot">' + foot + '</div></article>';
    }).join('');

    return '<h1>Results: 12 requests sorted, 4 drafts ready</h1>' +
      '<p class="lead">Drafts stay private until you send them. In this prototype, only the replies to Lena and Sam can be sent. Each one answers its request with a direct reply. The other two drafts cannot be sent here.</p>' +
      '<h2 class="sub">Requests, ranked by urgency</h2><ul class="requests">' + rows + '</ul>' +
      '<h2 class="sub">Draft replies (4)</h2><div class="drafts">' + cards + '</div>' +
      '<div class="btn-row"><button class="btn" type="button" data-act="summary">Finish and view summary</button></div>';
  }

  function viewEdit() {
    var k = s.editing, d = DRAFTS[k];
    return '<h1>Edit the draft reply to ' + esc(d.name) + '</h1>' +
      '<div class="card"><div class="label hint">Request from ' + esc(d.name) + '</div><p>' + esc(d.request) + '</p></div>' +
      '<h2 class="sub">Your draft (not sent)</h2>' +
      '<label class="sr-only" for="draft-text">Draft reply to ' + esc(d.name) + '</label>' +
      '<textarea id="draft-text">' + esc(s.texts[k]) + '</textarea>' +
      '<div class="btn-row"><button class="btn" type="button" data-act="save" id="save-btn">Save</button>' +
      '<button class="btn btn-secondary" type="button" data-act="cancel">Cancel</button></div>';
  }

  function viewSummary() {
    var items = ['Read 12 requests and 5 board cards.', 'Sorted the requests and flagged 2 as urgent.', 'Wrote 4 draft replies.'];
    if (s.stopEarlier) { items.push('You asked me to stop. I paused after Sort and flag, and you resumed the work.'); }
    if (s.stopLast) { items.push('You asked me to stop while I was writing the drafts. I finished writing them first.'); }
    if (s.sent.length === 0) {
      items.push('Sent no messages.');
    } else if (s.sent.length === 1) {
      items.push('Sent 1 reply to ' + firstName(s.sent[0]) + ' after you authorised it (simulated).');
    } else {
      items.push('Sent 2 replies (to ' + firstName(s.sent[0]) + ' and ' + firstName(s.sent[1]) + '). You authorised each one separately (simulated).');
    }
    return '<h1>Summary</h1><h2 class="sub">What I did</h2><ul class="summary-list">' +
      items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '<div class="btn-row"><button class="btn btn-secondary" type="button" data-act="back-results">Back to results</button></div>';
  }

  function viewDialog() {
    if (s.modal === 'access') {
      return dialog('Allow me to read two things',
        '<div class="source"><div class="name">Inbox</div><div class="where">Requests inbox, Northwind Studio</div></div>' +
        '<div class="source"><div class="name">Board</div><div class="where">Weekly planning board, Northwind Studio</div></div>' +
        '<p>I can only read them. I cannot change them.</p><p class="hint">Nothing is sent without your approval.</p>',
        '<button class="btn btn-secondary" type="button" data-act="not-now">Not now</button>' +
        '<button class="btn" type="button" data-act="grant" data-first>Grant access</button>');
    }
    if (s.modal === 'notNow') {
      return dialog('Allow me to read two things',
        '<p class="banner">Access not granted. I have not read anything and I have not started any work.</p>' +
        '<div class="source"><div class="name">Inbox: Not granted</div><div class="where">Requests inbox, Northwind Studio</div></div>' +
        '<div class="source"><div class="name">Board: Not granted</div><div class="where">Weekly planning board, Northwind Studio</div></div>' +
        '<p class="hint">Returning to the task screen in ' + s.countdown + ' seconds...</p>',
        '<button class="btn" type="button" data-act="back-task" data-first>Back to task now</button>');
    }
    if (s.modal === 'send') {
      var k = s.sending, d = DRAFTS[k];
      var other = k === 'sam' ? 'lena' : 'sam';
      var carry = isSent(other)
        ? ' Your earlier approval for ' + DRAFTS[other].name + ' does not carry over.' : '';
      return dialog('Send this reply to ' + d.name + '?',
        '<div class="quote">' + esc(s.texts[k]) + '</div>' +
        '<p>This goes to someone other than you and may not be undone.</p>' +
        '<p>Your approval covers this one message only.' + esc(carry) + '</p>' +
        '<p class="hint esc-hint">Press Esc to cancel. Nothing is sent unless you choose Authorise.</p>',
        '<button class="btn btn-secondary" type="button" data-act="cancel-send" data-first>Cancel</button>' +
        '<button class="btn" type="button" data-act="authorise">Authorise</button>');
    }
    return '';
  }

  function dialog(title, body, buttons) {
    return '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">' +
      '<h2 id="dlg-title">' + esc(title) + '</h2>' + body +
      '<div class="btn-row">' + buttons + '</div></div>';
  }

  function render(moveFocus) {
    renderChips();
    renderRail();

    var html;
    switch (s.screen) {
      case 'plan': html = viewPlan(); break;
      case 'sort':
      case 'draft': html = viewWork(); break;
      case 'paused': html = viewPaused(); break;
      case 'results': html = viewResults(); break;
      case 'edit': html = viewEdit(); break;
      case 'summary': html = viewSummary(); break;
      default: html = viewTask();
    }
    var scrollY = window.scrollY;
    $main.innerHTML = html;

    if (s.modal) {
      var wasOpen = !$overlay.hidden && $overlay.getAttribute('data-modal') === s.modal && $overlay.getAttribute('data-who') === String(s.sending);
      var focusedId = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-act');
      $overlay.innerHTML = viewDialog();
      $overlay.hidden = false;
      $overlay.setAttribute('data-modal', s.modal);
      $overlay.setAttribute('data-who', String(s.sending));
      if (!wasOpen) {
        var first = $overlay.querySelector('[data-first]');
        if (first) { first.focus(); }
      } else if (focusedId) {
        var again = $overlay.querySelector('[data-act="' + focusedId + '"]');
        if (again) { again.focus(); }
      }
    } else {
      $overlay.hidden = true;
      $overlay.innerHTML = '';
      $overlay.removeAttribute('data-modal');
      if (moveFocus) {
        $main.focus({ preventScroll: true });
        window.scrollTo(0, 0);
        var heading = $main.querySelector('h1');
        if (heading) { $announce.textContent = heading.textContent; }
      }
      else { window.scrollTo(0, scrollY); }
    }
  }

  // ----- Events -----
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) { return; }
    var act = el.getAttribute('data-act');
    var k = el.getAttribute('data-k');
    switch (act) {
      case 'open-access': openAccess(); break;
      case 'grant': grant(); break;
      case 'not-now': notNow(); break;
      case 'back-task': backToTask(); break;
      case 'stop': stop(); break;
      case 'resume': resume(); break;
      case 'edit': openEdit(k); break;
      case 'save': saveEdit(s.editing, document.getElementById('draft-text').value); break;
      case 'cancel': cancelEdit(); break;
      case 'send': openSend(k); break;
      case 'cancel-send': closeSend(); break;
      case 'authorise': authorise(); break;
      case 'summary': openSummary(); break;
      case 'back-results': backToResults(); break;
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'draft-text') {
      var btn = document.getElementById('save-btn');
      if (btn) { btn.disabled = !e.target.value.trim(); }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (s.modal === 'send') {
      if (e.key === 'Escape') { e.preventDefault(); closeSend(); return; }
      if (e.key === 'Tab') {
        var f = Array.prototype.slice.call($overlay.querySelectorAll('button'));
        if (!f.length) { return; }
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
      }
    } else if (s.modal === 'access' || s.modal === 'notNow') {
      if (e.key === 'Tab') {
        var g = Array.prototype.slice.call($overlay.querySelectorAll('button'));
        var j = g.indexOf(document.activeElement);
        if (e.shiftKey && (j <= 0)) { e.preventDefault(); g[g.length - 1].focus(); }
        else if (!e.shiftKey && (j === g.length - 1)) { e.preventDefault(); g[0].focus(); }
      }
    }
  });

  render(false);
})();
