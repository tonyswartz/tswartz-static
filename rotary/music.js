// Background music for the Four-Way Test: a hidden YouTube player behind one
// play/pause button at the bottom of the graphic. Nothing plays until the
// button is pressed, and every page load starts at a random song.
(function () {
  var VIDEO = 'e_DTfMJOPbc'; // "50 Greatest Hits Vol.2", Massimo Roberti: solo acoustic guitar, no singing
  // Where the faster songs start, in seconds (from the video's chapters). The
  // slow ones still play in their turn; the music just never opens on one.
  var SONGS = [
    1573, 2018, 2198, 2430, 2991, 3830, 4020, 4340, 5028, 5203, 5456, 5597,
    5966, 6340, 6814, 6975, 7120, 7353, 7791, 7941, 8806, 9054, 9402, 10141
  ];
  // /rotary is a list of links, so there the music belongs to the full-screen
  // graphic alone: the player loads when it opens and stops when it closes.
  var fullScreenOnly = document.currentScript.hasAttribute('data-full-screen-only');
  var PLAY = 'M8 5v14l11-7z';
  var PAUSE = 'M6 5h4v14H6zm8 0h4v14h-4z';

  var style = document.createElement('style');
  style.textContent =
    '.music-holder{position:fixed;left:0;bottom:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none}' +
    '.music-button{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:20;' +
    'display:flex;align-items:center;justify-content:center;width:44px;height:44px;margin:0 0 0 -22px;padding:0;' +
    'border:0;border-radius:50%;background:rgba(0,0,0,.35);color:#fff;cursor:pointer}' +
    '.music-button:hover,.music-button:focus-visible{background:rgba(0,0,0,.55)}' +
    '.music-button:focus-visible{outline:2px solid #fff;outline-offset:2px}';
  document.head.appendChild(style);

  // The player has to stay in the page to make sound, so it is shrunk to an
  // invisible pixel instead of being removed.
  var holder = document.createElement('div');
  holder.className = 'music-holder';
  holder.setAttribute('aria-hidden', 'true');
  var slot = document.createElement('div');
  slot.id = 'music-player';
  holder.appendChild(slot);
  document.body.appendChild(holder);

  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'music-button';
  button.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor"/></svg>';
  var icon = button.querySelector('path');
  var show = function (playing) {
    icon.setAttribute('d', playing ? PAUSE : PLAY);
    button.title = playing ? 'Pause music' : 'Play music';
    button.setAttribute('aria-label', button.title);
  };
  show(false);

  var player;
  var ready = false;
  var api;
  var load = function () {
    if (api) return;
    api = document.createElement('script');
    api.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(api);
  };

  // Full screen shows only the graphic, so the button moves into it and back.
  var place = function () {
    var full = document.fullscreenElement || document.webkitFullscreenElement;
    if (full) load();
    if (!ready) return;
    var host = full || (fullScreenOnly ? null : document.body);
    if (!host) {
      player.pauseVideo();
      button.remove();
    } else if (button.parentNode !== host) host.appendChild(button);
  };
  document.addEventListener('fullscreenchange', place);
  document.addEventListener('webkitfullscreenchange', place);

  button.addEventListener('click', function (event) {
    event.stopPropagation(); // a click on the full-screen graphic closes it
    var state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) player.pauseVideo();
    else player.playVideo();
  });

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player(slot, {
      width: 200,
      height: 200,
      videoId: VIDEO,
      playerVars: { start: SONGS[Math.floor(Math.random() * SONGS.length)], playsinline: 1 },
      events: {
        onReady: function () {
          player.getIframe().tabIndex = -1;
          ready = true;
          place();
        },
        onStateChange: function (event) {
          // At the end of the video, carry on from the first of those songs.
          if (event.data === YT.PlayerState.ENDED) {
            player.seekTo(SONGS[0], true);
            player.playVideo();
            return;
          }
          show(event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.BUFFERING);
        },
        onError: function () {
          ready = false;
          button.remove();
        }
      }
    });
  };
  if (!fullScreenOnly) load();
})();
