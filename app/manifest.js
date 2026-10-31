/** Lets phones and tablets install the site to the home screen and open it
 *  full screen, without the browser bar. */
export default function manifest() {
  return {
    name: 'Job Hunt HQ',
    short_name: 'Job Hunt',
    description: 'Backend + AI / Forward Deployed Engineer job hunt tracker.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f6f9',
    theme_color: '#2b56e0',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
