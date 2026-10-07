// Background music for the Rotary pages: a hidden YouTube player behind one
// play/pause button at the bottom of the screen. Nothing plays until the
// button is pressed, and every page load starts at a random song.
(function () {
  var VIDEO = 'Sz_M4ZBF8kg'; // "cozy acoustic covers", alexrainbirdMusic
  // Where each song starts, in seconds (the video's chapters).
  var SONGS = [
    0, 141, 352, 517, 701, 872, 992, 1141, 1309, 1482, 1725,
    1988, 2246, 2447, 2641, 2799, 2981, 3196, 3406, 3646, 3825, 4064,
    4196, 4411, 4638, 4884, 5036, 5217, 5372, 5555, 5800, 5982, 6222,
    6395, 6640, 6810, 7028, 7231, 7459, 7687, 7911, 8167, 8407, 8605
  ];
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

  // Full screen shows only the graphic, so the button moves into it and back.
  var place = function () {
    if (!ready) return;
    var host = document.fullscreenElement || document.webkitFullscreenElement || document.body;
    if (button.parentNode !== host) host.appendChild(button);
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
          // At the end of the video, carry on from the first song.
          if (event.data === YT.PlayerState.ENDED) {
            player.seekTo(0, true);
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
  var api = document.createElement('script');
  api.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(api);
})();
