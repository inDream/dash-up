const $ = require('jquery');
const Sortable = require('sortablejs');
const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

let uid;
let timer;
let filesList = [];
const uploadForm = $('#uploadForm')[0];
const sortEl = $('#items');
const msgEl = $('#message');
const progressEl = $('#progress');

const showMsg = msg => msgEl.text(msg);
const showLink = vid =>
  msgEl.html(`<a href="https://www.youtube.com/watch?v=${vid}">Video Link</a>`);

async function handleFiles(file) {
  const fpath = file.path;
  const isDirectory = fs.lstatSync(fpath).isDirectory();
  const fname = path.basename(fpath);
  if (isDirectory) {
    if (fpath.match(/node_modules/) || fname[0] === '.') {
      return;
    }
    fs.readdir(fpath, (err, files) => {
      for (let i = 0; i < files.length; i++) {
        handleFiles({ path: path.join(fpath, files[i]) });
      }
    });
  } else {
    const ext = path.extname(fpath);
    if ((ext === '.mp4' || ext === '.mov') && filesList.indexOf(fpath) === -1) {
      sortEl.append(`<li data-path="${fpath}">${fname}</li>`);
      filesList.push(fpath);
    }
  }
}

function checkProgress() {
  $.get(`/progress?uid=${uid}`)
    .done(data => {
      const { vid, progress } = data;
      if (progress === 100) {
        clearInterval(timer);
        progressEl.hide();
        showLink(vid);
      } else {
        progressEl.attr('value', progress);
      }
    });
}

$(document)
  .on('dragover', false)
  .on('drop', e => {
    e.preventDefault();
    $('#list').show();
    const { files } = e.originalEvent.dataTransfer;
    for (let i = 0; i < files.length; i++) {
      handleFiles(files[i]);
    }
  });

$('#resetBtn').click(() => {
  $('#list, #progress').hide();
  showMsg('');
  filesList = [];
  sortEl.empty();
});

$('#uploadBtn').click(e => {
  e.preventDefault();
  if (!uploadForm.checkValidity()) {
    showMsg('Please fill in Title & select Privacy setting');
    return;
  } else if (!filesList.length) {
    showMsg('Please select videos');
    return;
  }
  showMsg('');
  const data = {
    title: $('#title').val(),
    description: $('#description').val(),
    privacy: $('[name="privacy"]:checked').val(),
    files: sortEl.children().toArray().map(k => k.dataset.path)
  };
  $.ajax({
    method: 'POST',
    url: '/upload',
    data: JSON.stringify(data),
    contentType: 'application/json; charset=utf-8'
  })
    .done(({ error, id }) => {
      if (error) {
        return showMsg(error);
      }
      uid = id;
      progressEl.show();
      timer = setInterval(checkProgress, 250);
      return showMsg('Uploading');
    });
});

$(document).on('click', 'a[href^="http"]', e => {
  e.preventDefault();
  shell.openExternal(e.target.href);
});

$(() => {
  $('#list, #progress').hide();
  Sortable.create(sortEl[0]);
});
