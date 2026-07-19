// Shared photo lightbox. Wired to the fixed #lightbox/#lightboxImg/#lightboxClose
// markup every app using this ships in its index.html.
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxClose = document.getElementById("lightboxClose");

export function openLightbox(photo) {
  if (!photo) return;
  lightboxImg.src = photo.url;
  lightbox.classList.remove("hidden");
}

export function closeLightbox() {
  lightbox.classList.add("hidden");
}

lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});
