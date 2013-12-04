var Hoth = (function() {
  'use strict';

  var el = function(cl, tag) {
    var d = document.createElement(tag || 'div');
    d.className = cl || '';
    return d;
  };

  var pad = function(ch, n, s) {
    return Array(n + 1).join(ch).slice(s.length) + s;
  };

  var formatTime = function(d) {
    return d.getHours() + ':' + pad('0', 2, '' + d.getMinutes());
  };

  var Thread = function(data) {
    this.app = data.app;
    this.messages = [];
    this.shouldAutoscroll = true;
    this.contentSize = 0;
    this.dragging = false;
    this.$scroll = 0;
    this.$prompt = null;

    this.element = el('hoth-thread');
    this.element.appendChild(this.elName = el('hoth-thread-name'));
    this.element.appendChild(this.elContent = el('hoth-thread-content'));
    this.elContent.appendChild(this.elScrollbar = el('hoth-thread-scrollbar'));
    this.elScrollbar.appendChild(this.elMarkers = el('hoth-thread-markers'));
    this.elScrollbar.appendChild(this.elScrollbarHandle = el('hoth-thread-scrollbar-handle'));
    this.elContent.appendChild(this.elWrap = el('hoth-thread-wrap'));
    this.elWrap.appendChild(this.elMessages = el('hoth-thread-messages'));

    this.elScrollbar.addEventListener('mousedown', function(e) {
      this.dragging = true;
      this.drag(e);
      e.preventDefault();
      document.addEventListener('mousemove', this.onMouseMove);
      document.addEventListener('mouseup', this.onMouseUp);
    }.bind(this));
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);

    this.element.addEventListener('mousewheel', function(e) {
      this.shouldAutoscroll = false;
      this.scroll -= e.wheelDeltaY;
      this.updateScroll();
    }.bind(this));

    this.name = data.name;
  };

  Object.defineProperty(Thread.prototype, 'name', {
    set: function(name) {
      this.$name = name;
      if (name) {
        this.elName.textContent = name;
        this.elName.style.display = 'block';
        this.element.classList.add('named');
      } else {
        this.elName.style.display = 'none';
        this.element.classList.remove('named');
      }
    },
    get: function() {
      return this.$name;
    }
  });

  Object.defineProperty(Thread.prototype, 'prompt', {
    set: function(prompt) {
      if (this.$prompt) {
        this.$prompt.thread = null;
        this.elMessages.removeChild(this.$prompt.element);
      }
      if (this.$prompt = prompt) {
        if (prompt.thread) {
          prompt.thread.prompt = null;
        }
        prompt.thread = this;
        this.elMessages.appendChild(prompt.element);
      }
    },
    get: function() {
      return this.$prompt;
    }
  });

  Thread.prototype.append = function(message) {
    message.delete();

    this.messages.push(message);
    if (this.prompt) {
      this.elMessages.insertBefore(message.element, this.prompt.element);
    } else {
      this.elMessages.appendChild(message.element);
    }
    message.thread = this;

    this.contentChanged();
  };

  Thread.prototype.delete = function() {
    if (!this.app) return;

    if (this.element.parentNode === this.app.element) {
      this.app.element.removeChild(this.element);
    }

    var i = this.app.threads.indexOf(this);
    if (i !== -1) {
      this.app.threads.splice(i, 1);
    }

    if (this.prompt) {
      this.prompt = null;
      this.app.activeThread = null;
    }
  };

  Thread.prototype.reply = function(message) {
    this.shouldAutoscroll = true;
    this.append(message);
  };

  Thread.prototype.onMouseMove = function(e) {
    if (!this.dragging) return;
    this.drag(e);
  };

  Thread.prototype.onMouseUp = function(e) {
    this.dragging = false;
    this.drag(e);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  };

  Thread.prototype.drag = function(e) {
    var scrollbarSize = this.elScrollbar.offsetHeight;
    var viewportSize = this.elContent.offsetHeight;
    var contentSize = Math.max(viewportSize, this.elWrap.offsetHeight);

    var d = (1 - (e.clientY - this.elScrollbar.getBoundingClientRect().top) / scrollbarSize) / Thread.SCROLL_CONSTANT;
    var x = -d / (Thread.SCROLL_CONSTANT * d - 1);
    this.scroll = contentSize - x * viewportSize;
  };

  Thread.prototype.viewportChanged = function() {
    this.viewportSize = this.elContent.offsetHeight;
    this.scrollbarSize = this.elScrollbar.offsetHeight;
    this.rescroll()
  };

  Thread.prototype.contentChanged = function() {
    this.contentSize = this.elWrap.offsetHeight;
    this.rescroll();
  };

  Object.defineProperty(Thread.prototype, 'scroll', {
    set: function(value) {
      if (!this.scrollbarSize) {
        this.$scroll = value
        return;
      }

      this.$scroll = value = Math.max(0, Math.min(value, this.contentSize - this.viewportSize));
      this.updateScroll(true);
    },
    get: function() {
      return this.$scroll;
    }
  });

  Thread.AUTOSCROLL_THRESHOLD = 5;
  Thread.SCROLL_CONSTANT = .1;

  Object.prototype.rescroll = function() {
    if (this.shouldAutoscroll) {
      this.scroll = this.contentSize - this.viewportSize;
    } else {
      this.updateScroll();
    }
  };

  Object.prototype.updateScroll = function(property) {
    var max = Math.max(this.contentSize, this.viewportSize);
    if (property) {
      this.shouldAutoscroll = max - this.viewportSize - this.scroll >= Thread.AUTOSCROLL_THRESHOLD;
    }
    var x = (max - this.scroll) / this.viewportSize;
    var y = (max - (this.scroll + this.viewportSize)) / this.viewportSize;

    var minValue = this.scrollbarSize * (1 - Thread.SCROLL_CONSTANT * x / (Thread.SCROLL_CONSTANT * x + 1));
    var maxValue = this.scrollbarSize * (1 - Thread.SCROLL_CONSTANT * y / (Thread.SCROLL_CONSTANT * y + 1));

    this.elScrollbarHandle.style.top = minValue + 'px';
    this.elScrollbarHandle.style.height = Math.max(1, maxValue - minValue) + 'px';

    this.elWrap.style.top = -this.scroll + 'px';
  };

  var Message = function(data) {
    this.app = data.app;
    this.children = [];

    this.template();

    this.time = data.time || new Date;
    this.body = data.body || '';
  };

  Object.defineProperty(Message.prototype, 'time', {
    set: function(time) {
      this.$time = time;
      this.elTimestamp.textContent = formatTime(time);
    },
    get: function() {
      return this.$time;
    }
  });

  Object.defineProperty(Message.prototype, 'body', {
    set: function(body) {
      this.$body = body;
      this.elBody.textContent = body;
    },
    get: function() {
      return this.$body;
    }
  });

  Message.prototype.template = function() {
    this.element = el('hoth-message');
    this.element.appendChild(this.elHeader = el('hoth-message-header'));
    this.elHeader.appendChild(this.elTimestamp = el('hoth-message-time'));
    this.element.appendChild(this.elBody = el('hoth-message-body'));
  };

  Message.prototype.delete = function() {
    if (!this.thread) return;

    if (this.element.parentNode === this.thread.elMessages) {
      this.thread.elMessages.removeChild(this.element);
    }

    var i = this.thread.messages.indexOf(this);
    if (i !== -1) {
      this.thread.messages.splice(i, 1);
    }
  };

  var ChatMessage = function(data) {
    Message.call(this, data);

    if (data.author) this.author = data.author;
  };
  ChatMessage.prototype = Object.create(Message.prototype);

  Object.defineProperty(ChatMessage.prototype, 'author', {
    set: function(author) {
      this.$author = author;
      this.elAuthor.textContent = author.name;
    },
    get: function() {
      return this.$author;
    }
  });

  ChatMessage.prototype.template = function() {
    Message.prototype.template.call(this);

    this.element.classList.add('chat');

    this.elHeader.appendChild(this.elAuthor = el('hoth-message-author'));
  };

  var SystemMessage = function(data) {
    Message.call(this, data);
  };
  SystemMessage.prototype = Object.create(Message.prototype);

  SystemMessage.prototype.template = function() {
    Message.prototype.template.call(this);

    this.element.classList.add('system');
  };

  var Prompt = function(data) {
    this.element = el('hoth-message');
    this.element.appendChild(this.elBody = el('hoth-message-body'));

    this.elBody.appendChild(this.elInput = el('hoth-message-input', 'textarea'));
    document.body.appendChild(this.elMeasure = el('hoth-message-measure'));
    this.elMeasure.textContent = 'X';

    this.elInput.placeholder = 'Say something\u2026';
    this.elInput.autofocus = true;
    this.elInput.style.height = this.elMeasure.offsetHeight + 'px';

    this.elInput.addEventListener('input', this.autosize.bind(this));

    this.elInput.addEventListener('keydown', this.onKeyDown.bind(this));
  };

  Prompt.prototype.onKeyDown = function(e) {
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.keyCode === 13) {
      if (this.elInput.value) {
        this.send(this.elInput.value);
      }
      this.elInput.value = '';
      e.preventDefault();
    }
  };

  Prompt.prototype.autosize = function() {
    this.elMeasure.textContent = this.elInput.value + 'X';
    this.elInput.style.height = this.elMeasure.offsetHeight + 'px';
  };

  Prompt.prototype.send = function(value) {
    if (value[0] === '/') {
      this.sendCommand(value.substr(1));
    } else {
      this.sendMessage(value);
    }
  };

  Prompt.prototype.sendMessage = function() {
    this.thread.reply(new ChatMessage({
      author: this.app.user,
      body: this.elInput.value
    }));
  };

  Prompt.prototype.sendCommand = function(command) {
    this.reply(new SystemMessage({
      body: 'Commands are not implemented'
    }));
  };

  var User = function(data) {
    this.name = data.name;
  };

  var App = function() {
    this.user = new User({ name: 'Nathan Dinsmore' });
    this.threads = [];

    this.element = el('hoth-app');

    this.main = new Thread({ name: 'main' });
    this.append(this.main);

    this.prompt = new Prompt();
    this.open(this.main);

    document.body.addEventListener('keydown', function(e) {
      var modifiers =
        (e.ctrlKey ? 'c' : '') +
        (e.altKey ? 'a' : '') +
        (e.shiftKey ? 's' : '') +
        (e.metaKey ? 'm' : '');
    }.bind(this));

    window.addEventListener('resize', this.layout.bind(this));
  };

  Object.defineProperty(App.prototype, 'prompt', {
    set: function(prompt) {
      if (this.$prompt) {
        this.$prompt.app = null;
        this.$prompt.delete();
      }
      if (this.$prompt = prompt) {
        prompt.app = this;
        if (this.activeThread) {
          this.activeThread.prompt = prompt;
        }
      }
    },
    get: function() {
      return this.$prompt;
    }
  });

  App.prototype.open = function(thread) {
    if (thread.app !== this) {
      thread.delete();
      this.append(thread);
    }
    this.activeThread = thread;
    thread.prompt = this.prompt;
  };

  App.prototype.append = function(thread) {
    thread.delete();
    this.threads.push(thread);
    this.element.appendChild(thread.element);
    thread.app = this;
  };

  App.prototype.layout = function() {
    this.threads.forEach(function(thread) {
      thread.viewportChanged();
    });
  };

  App.prototype.reply = function(message) {
    this.prompt.thread.reply(message);
  };

  return {
    App: App,
    Thread: Thread,
    ChatMessage: ChatMessage,
    SystemMessage: SystemMessage,
    Message: Message
  };

}());