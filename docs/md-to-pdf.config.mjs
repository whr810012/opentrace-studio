/** @type {import('md-to-pdf').Config} */
export default {
  stylesheet: ['./docs/project-intro-print.css'],
  document_title: 'OpenTrace Studio 作品介绍',
  pdf_options: {
    format: 'A4',
    printBackground: true,
    margin: {
      top: '16mm',
      right: '14mm',
      bottom: '18mm',
      left: '14mm',
    },
  },
  launch_options: {
    args: ['--no-sandbox', '--disable-gpu'],
  },
}
