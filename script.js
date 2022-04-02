// TODO: Make shows and episodes work offline and not just appear in the downloads tab -> Get from downloads if possible, offline detection
// TODO: Don't try to load every single file on page load, instead load when episode is attempted to be downloaded or something like that.
// TODO: Push state to history so back button works as expected
// TODO: Delete button on downloaded items
// TODO: Add metadata when downloading using ID3 tag writer
// TODO: Show pending downloads in downloads
// TODO: Settings + themes page
// TODO: PWA
// TODO: Download all button in downloads that uses JSZip
let db = new IdbKvStore("state");
const fnr = /[ &\/\\#,+()$~%.'":*?<>{}]/g;
window.db = db;

window.addEventListener("offline", () => {
  app.refresher++;
})
window.addEventListener("online", () => {
  app.refresher++;
})
navigator.serviceWorker.register("sw.js");

console.log(`DB: %o`, db);
let app = Vue.createApp({
  data: () => ({
    // Promise
    audioSrc: null,
    searchQuery: "",
    show: null,
    refresher: 1,
    episode: null,
    //Just for .classLIst stuff
    hoveredButton: {},
    searchResults: { shows: [], episodes: [] },
    // home|search|show|play|downloads
    pageType: "home",
    playing: false,
    muted: false,
    episodeTime: 0,
    loading: false,
    error: {},
    canPlay: false,
    placeholder: "Search for podcasts...",
    downloadsLoading: false,
    downloads: [
      /*
      {episode: [episodeInstance], pending: false, data: [dataURL]}
      */
    ],
    zipDone: false,
    zipping: false,
    zipProgresses: {},
    // If currently deleting
    deleting: false,
  }),
  async mounted() {
    await fetch(
      "https://egoroof.ru/browser-id3-writer/js/browser-id3-writer.4.0.0.js"
    )
      .then((res) => res.text())
      .then(eval);
    await fetch(
      "https://cdn.jsdelivr.net/gh/gildas-lormeau/zip.js@2.4.5/dist/zip.min.js"
    )
      .then((res) => res.text())
      .then(eval);

    // zip.configure({maxWorkers: 4});
    getSettings();
    getDownloads();
    async function getSettings() {
      try {
        let settings = JSON.parse(await db.get("settings"));
        Object.assign(app, settings);
        if (app.pageType === 'play'){
          app.runEpisode(app.episode.show.id, app.episode.id);
        }
        let e = await until(a, 1000, 10);
        if (!e) {
          return;
        }
        app.seek(++settings.episodeTime);
      } catch (_) {
        console.log(_);
      }
    }
    async function getDownloads() {
      await new Promise(setTimeout);
      app.downloadsLoading = true;
      try {
        let downloads = JSON.parse(await db.get("downloads")) || [];
        app.downloads = downloads;
      } catch (_) {
        console.log(_);
        app.downloadsLoading = false;
      }
      app.downloadsLoading = false;
    }
  },
  watch: {
    searchQuery: updateParams,
    show: () => {
      resetAudio();
      updateParams();
    },
    episode: () => {
      resetAudio();
      updateParams();
    },
    pageType: () => {
      resetAudio();
      if (app.pageType === "search") {
        let idx = 0;
        let placeholders = [
          "Search for podcasts...",
          "Make sure to follow me on GitHub for more!",
          "Search something already!",
          "Hello?",
          "Search something? 😩",
          "Fr I thought you would've searched something by now",
          "Search podcasts...",
        ];
        setInterval(() => {
          app.placeholder = placeholders[idx % (placeholders.length - 1)];
          idx++;
        }, 3000);
      }
      updateParams();
    },
    searchResults: updateParams,
    async downloads() {
      // Store full download info
      let dls = app.downloads.filter((i) => !i.pending);
      await db.set("downloads", JSON.stringify(dls));
      console.log("Set downloads to ", dls);
      updateParams();
    },
    episodeTime() {
      updateParams();
    },
    async muted() {
      let el = await until(a, 1000);
      if (!el) {
        return;
      }
      a().muted = this.muted;
      updateParams();
    },
    async playing() {
      let el = await until(a, 1000);
      if (!el) {
        return;
      }
      if (this.playing) {
        a().play();
      } else {
        a().pause();
      }
      updateParams();
    },
  },
  methods: {
    // Deletes all downloads
    async deleteAll() {
      this.deleting = true;
      await Promise.all(
        app.downloads.map((i) =>
          Promise.all([db.remove(i.id), db.remove(`DATA-${i.id}`)])
        )
      );
      app.downloads = [];
      this.deleting = false;
      this.toast("Deleted");
    },
    async deleteEpisode(id) {
      app.loading = true;
      await db.remove(`DATA-${id}`);
      await db.remove(id);
      let idx = app.downloads.findIndex((i) => i?.id === id);
      delete app.downloads[idx];
      app.downloads = app.downloads.filter((i) => i.id);
      app.loading = false;
      app.hoveredButton = {};
    },
    btn(event, episode) {
      console.log("btn called");
      console.log({ type: event.type, episode });
      if (event.type === "click") {
        if (!this.downloads.find((i) => i.id === episode.id).pending) {
          console.log("Downloading episode ", episode);
          this.deleteEpisode(episode.id);
        }
      } else {
        app.hoveredButton = {
          id: episode.id,
        };
      }
      if (event.type === "mouseenter") {
        event.target.closest("button").classList.add("hovered");
        app.hoveredButton.hovered = true;
      }
      if (event.type === "mouseleave") {
        event.target.closest("button").classList.remove("hovered");
        app.hoveredButton.hovered = false;
      }
    },
    async downloadAll() {
      this.zipping = true;
      this.zipProgresses = Object.fromEntries(
        this.downloads.map((i) => [
          `${i.episode.title.replace(fnr, "_")}.mp3`,
          -1,
        ])
      );
      window.ZIP_BLOB = await this.makeZip(({ file, ...a }) => {
        this.zipProgresses[file] = a;
      });
      this.zipping = false;
      this.zipDone = true;
    },
    saveZip() {
      // Reset everything
      this.zipProgresses = {};
      this.zipping = false;
      this.zipDone = false;
      if (!window.ZIP_BLOB) {
        console.trace("Couldn't find zip file [window.ZIP_BLOB]");
        return this.error("Couldn't find zip file");
      }
      app.save(window.ZIP_BLOB, "Podcasts.zip");
      this.toast("Downloaded");
    },
    toast(text) {
      console.log("TODO: Toast");
    },
    showError(e){
      this.pageType = 'error';
      this.error = e;
      this.loading = false;
    },
    srcset(thing) {
      return (
        s(thing?.images) ||
        s(thing?.episode?.images) ||
        s(thing?.show?.images) ||
        s(thing?.episode?.show?.images)
      );
      function s(a) {
        if (!a) {
          return;
        }
        return Object.entries(a)
          .filter((i) => i[1] && /^x[0-9]+$/.test(i[0]))
          .map((i) => `${i[1]} ${i[0].slice(1)}w`)
          .join(", ");
      }
    },
    audioLoaded(el) {
      this.canPlay = true;
      window.PROGRESS_INTERVAL = setInterval(() => {
        if (this.playing) {
          this.episodeTime = el.currentTime;
          document.querySelector("input[type=range]").value = Math.round(
            el.currentTime
          );
        }
      }, 500);
    },
    async makeZip(progress = () => {}) {
      let files = await Promise.all(
        app.downloads.map(async (i) => {
          progress({
            file: `${i.episode.title.replace(fnr, "_")}.mp3`,
            state: "metadata",
            percent: -1,
          });
          let out = {
            name: i.episode.title,
            data: await app.metadata(i.id),
            dir: i.episode.show.title.replace(fnr, "_"),
          };
          progress({
            file: `${out.name.replace(fnr, "_")}.mp3`,
            state: "Pending",
            percent: -1,
          });
          return out;
        })
      );
      console.log("Got files");
      let bwriter = new zip.BlobWriter();
      let writer = new zip.ZipWriter(bwriter);
      let promises = [];
      let directories = [...new Set(files.map((i) => i.dir))];
      for (let dir of directories) {
        await writer.add(dir, null, { directory: true });
      }
      for (let file of files) {
        let name = `${file.dir}/${file.name.replace(fnr, "_")}.mp3`;
        let reader = new zip.Data64URIReader(file.data);
        promises.push(
          writer.add(name, reader, {
            onprogress: (current, max) => {
              progress({
                file: `${file.name.replace(fnr, "_")}.mp3`,
                percent: Math.round((current / max) * 100),
              });
            },
          })
        );
      }
      await Promise.all(promises);
      return URL.createObjectURL(
        new Blob([await writer.close()], { type: "application/zip" })
      );
    },
    async download(show, epsId, target) {
      // If it's already downloaded save to disk
      if (app.downloads.find((i) => i.id === epsId)) {
        app.loading = true;
        let episode = JSON.parse(await db.get(epsId));
        app.save(
          URL.createObjectURL(await app.metadata(epsId, { blob: true })),
          app.downloads
            .find((i) => i.id === epsId)
            .episode.title.replace(/[^a-z0-9 -]/gi, "_")
        );
        return (app.loading = false);
      }
      let episode =
        (this.pageType === "play" ? this.episode : undefined) ||
        (await this.getEpisode(show, epsId));

      if (!episode) {
        return this.error("Couldn't find episode");
      }
      let id = episode.id;
      this.downloads.push({
        episode: episode,
        pending: true,
        data: null,
        show: await app.getShow(
          episode?.show?.id ||
            episode.showId ||
            (app.pageType === "show" && app.show.id)
        ),
        id,
      });
      if (!episode.url) {
        return this.error("Couldn't find episode URL when downloading");
      }
      console.log("Starting episode download for %o", episode);
      dataURL(episode.url).then((data) => {
        console.log("Got data for %o", episode.url);
        let idx = app.downloads.findIndex((i) => i.id === id);
        Object.assign(app.downloads[idx], {
          pending: false,
          data,
        });
        let woData = { ...app.downloads[idx] };
        delete woData.data;
        db.set(id, JSON.stringify(woData));
        // Data should already be string
        db.set(`DATA-${id}`, data);
        //Refresh
        app.downloads = [...app.downloads];
      });
      return;
    },
    // If there's something's been downloaded
    downloaded(id, online = true) {
      if (online && navigator.onLine) {
        return true;
      }
      return !!app.downloads.find(
        (i) => i.show.id === id || i.show.slug === id || i.id === id
      );
    },
    toBlob(dataURI) {
      const binStr = atob(dataURI.split(",")[1]);
      const len = binStr.length;
      const arr = new Uint8Array(len);
      const mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];
      for (let i = 0; i < len; i++) {
        arr[i] = binStr.charCodeAt(i);
      }

      const blob = new Blob([arr], {
        type: mimeString,
      });

      return URL.createObjectURL(blob);
    },
    save(url, fileName) {
      var a = document.createElement("a");
      document.body.appendChild(a);
      a.style = "display: none";
      a.href = url;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    seek(seconds) {
      document.querySelector("audio").currentTime =
        Math.round(seconds).toString();
      document.querySelector("input[type=range]").value = Math.round(seconds);
    },
    async runSearch() {
      this.loading = true;
      this.searchResults = await this.search(this.searchQuery);
      for (let i in app.searchResults.shows) {
        let s = app.searchResults.shows[i];
        if (!s.slug) {
          delete app.searchResults.shows[i];
          continue;
        }
        if (/-1/.test(s.slug)) {
          delete app.searchResults.shows[i];
        }
        if (
          app.searchResults.shows.find(
            (j) =>
              j?.slug.replace(/-/g, "").toLowerCase() ===
                s.slug.replace(/-/g, "").toLowerCase() && j?.slug !== s.slug
          )
        ) {
          delete app.searchResults.shows[
            app.searchResults.shows.findIndex(
              (j) =>
                j?.slug.replace(/-/g, "").toLowerCase() ===
                  s.slug.replace(/-/g, "").toLowerCase() && j?.slug !== s.slug
            )
          ];
        }
      }
      app.searchResults.shows = [...app.searchResults.shows].filter(Boolean);
      this.loading = false;
    },
    async runShow(slug) {
      this.loading = true;
      this.show = await this.getShow(slug);
      this.pageType = "show";
      this.loading = false;
    },
    async runEpisode(showID, episodeID) {
      this.loading = true;
      this.episode = await this.getEpisode(showID, episodeID);
      this.pageType = "play";
      this.loading = false;
      this.audioSrc = await this.getSrc(this.episode);
    },
    duration(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.round(seconds % 60);
      return [h, m > 9 ? m : h ? "0" + m : m || "0", s > 9 ? s : "0" + s]
        .filter(Boolean)
        .join(":");
    },
    search(term) {
      return app.fetch(
        `https://play-proxy-api.prod.audience-growth.acast.cloud/api/search?term=${term}`
      ).then((res) => res.json());
    },
    async getEpisode(showID, episodeID) {
      console.log("Called getEpisode: ", showID, episodeID);
      if (app.downloads.find((i) => i.id === episodeID)) {
        return JSON.parse(await db.get(episodeID)).episode;
      }
      return await app.fetch(
        `https://feeder.acast.com/api/v1/shows/${showID}/episodes/${episodeID}?showInfo=true`
      ).then((res) => res.json());
    },
    async getShow(id) {
      let item = app.downloads.find(
        (i) => i?.show?.id === id || i?.show?.slug === id
      );
      if (item) {
        return JSON.parse(await db.get(item.id)).show;
      }
      return app.fetch(
        `https://feeder-graphql.supersonic.acast.com/graphql?${new URLSearchParams(
          {
            operationName: "getShow",
            variables: JSON.stringify({
              showIdOrSlug: id,
            }),
            extensions: JSON.stringify({
              persistedQuery: {
                version: 1,
                // No idea why this is required, doesn't seem to vary based on time or query so I used the example one
                sha256Hash:
                  "3eecf7e82a023b75a04612b732bccb2ac036a82b592ec9517848c2036fb49a3c",
              },
            }),
          }
        ).toString()}`
      )
        .then((res) => res.json())
        .then((j) => ({ ...j.data.show, episodes: j.data.episodes }));
    },
    fetch(url, opts = {}, retried = false) {
      return new Promise(async (resolve) => {
        let r = await fetch(url, opts).catch(async e => {
          if (retried) {
            app.showError({text: "Failed to fetch, maybe you aren't online?"})
          } else {
            return resolve(
              await app.fetch(
                `https://cors.explosionscratc.repl.co/${url.split("//")[1]}`,
                opts,
                true
              )
            );
          }
        });
        if (r.ok){
          return resolve(r);
        }
      });
    },
    async metadata(episodeId, opts = {}) {
      let dataURL = await db.get(`DATA-${episodeId}`);
      let i = JSON.parse(await db.get(episodeId)).episode;
      let ab = toAB(dataURL);
      let writer = new ID3Writer(ab);
      const tags = {
        title: "TIT2",
        artists: "TPE1",
        composers: "TCOM",
        genres: "TCON",
        albumTitle: "TALB",
        albumArtist: "TPE2",
        albumYear: "TYER",
        albumCover: "APIC",
        labelName: "TPUB",
        lyrics: "USLT",
        number: "TRCK",
        discNumber: "TPOS",
        audioPage: "WOAF",
        audioSourcePage: "WOAS",
        homepage: "WORS",
        contact: "WPUB",
        // For some reason throws an error that it's not supported but it shows in the README
        copyright: "TCOP",
      };

      let setTags = {
        title: i.title,
        artists: [i.show.author],
        composers: [i.show.author],
        genres: ["podcast"],
        albumTitle: i.show.title,
        albumArtist: i.show?.owner?.name,
        albumYear: i.show?.publishDate.split("-")[0],
        albumCover: {
          type: 3,
          data: await app
            .fetch(i.image || i.show.image)
            .then((res) => res.blob())
            .then((b) => b.arrayBuffer()),
          description: `Cover image for ${i.show.title}`,
        },
        audioPage: i.url,
        audioSourcePage: i.link,
        homepage: i.show.link,
        contact: i.show.owner.email,
        //copyright: i.copyright || i.show.copyright,
      };

      for (let [k, v] of Object.entries(setTags)) {
        writer.setFrame(tags[k], v);
      }

      writer.addTag();
      if (opts.blob) {
        return writer.getBlob();
      }
      return await toData(writer.getBlob());
      function toData(blob) {
        return new Promise((callback) => {
          var a = new FileReader();
          a.onload = function (e) {
            callback(e.target.result);
          };
          a.readAsDataURL(blob);
        });
      }
      function toAB(dataURI) {
        var byteString = atob(dataURI.split(",")[1]);
        var mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];
        var ab = new ArrayBuffer(byteString.length);
        var ia = new Uint8Array(ab);
        for (var i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        return ab;
      }
    },
    async getSrc(episode){
      console.log("Getting source URL", episode)
      // False to not override when online
      if (app.downloaded(episode.id, false)) {
        return app.toBlob(await db.get(`DATA-${episode.id}`));
      } else {
        return episode.url;
      }
    },
    sanitize(html, tags, attributes) {
      var attributes = attributes || [
        { attribute: "src", tags: "*", regex: /^(?:https|http|\/\/):/ },
        { attribute: "href", tags: "*", regex: /^(?!javascript:).+/ },
        { attribute: "width", tags: "*", regex: /^[0-9]+$/ },
        { attribute: "height", tags: "*", regex: /^[0-9]+$/ },
        { attribute: "id", tags: "*", regex: /^[a-zA-Z]+$/ },
        { attribute: "class", tags: "*", regex: /^[a-zA-Z ]+$/ },
        { attribute: "value", tags: ["INPUT", "TEXTAREA"], regex: /^.+$/ },
        { attribute: "checked", tags: ["INPUT"], regex: /^(?:true|false)+$/ },
        {
          attribute: "placeholder",
          tags: ["INPUT", "TEXTAREA"],
          regex: /^.+$/,
        },
        {
          attribute: "alt",
          tags: ["IMG", "AREA", "INPUT"],
          //"^" and "$" match beggining and end
          regex: /^[0-9a-zA-Z]+$/,
        },
        {
          attribute: "autofocus",
          tags: ["INPUT"],
          regex: /^(?:true|false)+$/,
        },
        {
          attribute: "for",
          tags: ["LABEL", "OUTPUT"],
          regex: /^[a-zA-Z0-9]+$/,
        },
      ];
      var tags = tags || [
        "I",
        "P",
        "B",
        "BODY",
        "HTML",
        "DEL",
        "INS",
        "STRONG",
        "SMALL",
        "A",
        "IMG",
        "CITE",
        "FIGCAPTION",
        "ASIDE",
        "ARTICLE",
        "SUMMARY",
        "DETAILS",
        "NAV",
        "TD",
        "TH",
        "TABLE",
        "THEAD",
        "TBODY",
        "NAV",
        "SPAN",
        "BR",
        "CODE",
        "PRE",
        "BLOCKQUOTE",
        "EM",
        "HR",
        "H1",
        "H2",
        "H3",
        "H4",
        "H5",
        "H6",
        "DIV",
        "MAIN",
        "HEADER",
        "FOOTER",
        "SELECT",
        "COL",
        "AREA",
        "ADDRESS",
        "ABBR",
        "BDI",
        "BDO",
      ];

      attributes = attributes.map((el) => {
        if (typeof el === "string") {
          return { attribute: el, tags: "*", regex: /^.+$/ };
        }
        let output = el;
        if (!el.hasOwnProperty("tags")) {
          output.tags = "*";
        }
        if (!el.hasOwnProperty("regex")) {
          output.regex = /^.+$/;
        }
        return output;
      });
      var el = new DOMParser().parseFromString(html, "text/html");
      var elements = el.querySelectorAll("*");
      [...el.querySelectorAll("p")]
        .filter((i) => i.innerText.includes("acast.com"))
        .forEach((i) => i.remove());
      for (let i = 0; i < elements.length; i++) {
        const current = elements[i];
        let attr_list = get_attributes(current);
        for (let j = 0; j < attr_list.length; j++) {
          const attribute = attr_list[j];
          if (!attribute_matches(current, attribute)) {
            current.removeAttribute(attr_list[j]);
          }
        }
        if (!tags.includes(current.tagName)) {
          current.remove();
        }
      }
      return el.documentElement.innerHTML;
      function attribute_matches(element, attribute) {
        let output = attributes.filter((attr) => {
          let returnval =
            attr.attribute === attribute &&
            (attr.tags === "*" || attr.tags.includes(element.tagName)) &&
            attr.regex.test(element.getAttribute(attribute));
          return returnval;
        });

        return output.length > 0;
      }
      function get_attributes(element) {
        for (
          var i = 0, atts = element.attributes, n = atts.length, arr = [];
          i < n;
          i++
        ) {
          arr.push(atts[i].nodeName);
        }
        return arr;
      }
    },
  },
}).mount("#app");

window.app = app;

async function updateParams() {
  let keys = [
    "searchQuery",
    "pageType",
    "episodeTime",
    "muted",
    "show",
    "episode",
    "searchResults",
  ];
  let p = Object.fromEntries(keys.map((i) => [i, app[i]]));
  await db.set("settings", JSON.stringify(p));
}

function a() {
  return document.querySelector("audio, #episodeAudioPlayer");
}

function until(condition, timeout, poll = 50) {
  return new Promise((resolve) => {
    let startTime = performance.now();
    let i = setInterval(() => {
      let r = condition();
      if (r) {
        resolve(r);
      } else if (performance.now() - startTime > timeout) {
        resolve(undefined);
      }
    });
  });
}

function resetAudio() {
  // Reset episode time
  app.episodeTime = 0;
  app.playing = false;
  let i = setInterval(() => {});
  while (i--) {
    clearInterval(i);
  }
  let j = document.querySelector("input[type=range]");
  if (j) {
    j.value = 0;
  }
}

function dataURL(url) {
  return new Promise(async (resolve) => {
    let blob = await fetch(
      `https://cors.explosionscratc.repl.co/${url.split("//")[1]}`
    ).then((res) => res.blob());
    let r = new FileReader();
    r.onload = () => {
      resolve(r.result);
    };
    r.readAsDataURL(blob);
  });
}