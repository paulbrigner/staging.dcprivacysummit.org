const playlistControllers = new Map();

document.addEventListener('DOMContentLoaded', () => {
  const layouts = document.querySelectorAll('[data-playlist-id]');
  layouts.forEach(setupPlaylistLayout);
  window.addEventListener('message', handleYouTubeMessages);
});

function setupPlaylistLayout(layout) {
  const playlistId = layout.getAttribute('data-playlist-id');
  const iframe = layout.querySelector('iframe');
  const listContainer = layout.querySelector('.playlist-items');
  const status = layout.querySelector('.playlist-status');

  if (!playlistId || !iframe || !listContainer) {
    return;
  }

  const baseEmbed = iframe.dataset.embedBase || 'https://www.youtube-nocookie.com/embed/';
  const origin = window.location.origin;
  const initialIndex = Number(iframe.dataset.initialIndex || 0);

  fetchPlaylistFeed(playlistId)
    .then(items => {
      renderPlaylist(items, listContainer, status);
      bindPlaylistInteractions({
        items,
        listContainer,
        iframe,
        baseEmbed,
        playlistId,
        origin,
        initialIndex
      });
    })
    .catch(err => {
      console.error('Playlist feed failed', err);
      if (status) {
        status.textContent = 'Unable to load videos right now.';
        status.classList.add('playlist-status--error');
      }
    });
}

async function fetchPlaylistFeed(playlistId) {
  const endpoint = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`Bad status ${response.status}`);
  }

  const text = await response.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'application/xml');
  const entries = Array.from(xml.querySelectorAll('entry'));

  return entries.map((entry, index) => ({
    index,
    id: entry.querySelector('yt\\:videoId')?.textContent || '',
    title: entry.querySelector('title')?.textContent?.trim() || `Video ${index + 1}`,
    link: entry.querySelector('link')?.getAttribute('href') || '',
    published: entry.querySelector('published')?.textContent || ''
  })).filter(item => item.id);
}

function renderPlaylist(items, listContainer, status) {
  if (status) {
    status.textContent = 'Select a session:';
  }

  const fragment = document.createDocumentFragment();

  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'playlist-item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'playlist-item__button';
    button.dataset.videoId = item.id;
    button.dataset.videoIndex = item.index;
    button.setAttribute('aria-current', 'false');
    button.textContent = item.title;

    li.appendChild(button);
    fragment.appendChild(li);
  });

  listContainer.innerHTML = '';
  listContainer.appendChild(fragment);

  // Mark first item active by default
  const first = listContainer.querySelector('.playlist-item__button');
  if (first) {
    first.classList.add('is-active');
    first.setAttribute('aria-current', 'true');
  }
}

function bindPlaylistInteractions({
  items,
  listContainer,
  iframe,
  baseEmbed,
  playlistId,
  origin,
  initialIndex
}) {
  const playAtIndex = (index) => {
    const button = listContainer.querySelector(`.playlist-item__button[data-video-index="${index}"]`);
    if (!button) return;
    selectButton(button);
    const videoId = button.dataset.videoId;
    loadVideo({
      iframe,
      baseEmbed,
      playlistId,
      videoId,
      origin,
      index
    });
  };

  listContainer.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('.playlist-item__button');
    if (!button) return;
    const index = Number(button.dataset.videoIndex || 0);
    selectButton(button);
    loadVideo({
      iframe,
      baseEmbed,
      playlistId,
      videoId: button.dataset.videoId,
      origin,
      index
    });
  });

  playlistControllers.set(iframe, {
    listContainer,
    playlistId
  });

  playAtIndex(initialIndex);
}

function loadVideo({ iframe, baseEmbed, playlistId, videoId, origin, index }) {
  if (!videoId) return;
  const params = new URLSearchParams({
    list: playlistId,
    index: String(index),
    rel: '0',
    enablejsapi: '1',
    origin
  });
  iframe.src = `${baseEmbed}${videoId}?${params.toString()}`;
}

function selectButton(button) {
  const list = button.closest('.playlist-items');
  if (!list) return;
  list.querySelectorAll('.playlist-item__button.is-active').forEach(active => {
    active.classList.remove('is-active');
    active.setAttribute('aria-current', 'false');
  });
  button.classList.add('is-active');
  button.setAttribute('aria-current', 'true');
}

function handleYouTubeMessages(event) {
  if (!event || typeof event.data !== 'string') return;
  const origin = event.origin || '';
  if (!origin.includes('youtube.com')) return;

  let data;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }

  if (data?.event !== 'infoDelivery') return;
  const info = data.info || {};
  if (typeof info.playlistIndex !== 'number') return;

  for (const [iframe, controller] of playlistControllers.entries()) {
    if (iframe.contentWindow !== event.source) continue;
    const { listContainer } = controller;
    const button = listContainer?.querySelector(`.playlist-item__button[data-video-index="${info.playlistIndex}"]`);
    if (button) {
      selectButton(button);
    }
  }
}
