# Cloudflare Worker for Dynamic Metadata in WeWeb SPA

This project demonstrates a Cloudflare Worker that acts as a reverse proxy server to dynamically fetch and modify metadata for WeWeb Single Page Applications (SPA). This solution is particularly useful for dynamic pages with URL parameters, such as event pages, where each page requires unique metadata.

## Use Case

When creating dynamic pages in WeWeb, such as `www.myapp.com/events/40`, all pages share the same metadata configured in the editor. However, you may need different metadata (title, description, keywords, and thumbnails) for each page based on the URL parameter (e.g., event ID). Since WeWeb apps are front-end only (SPA), we need a "backend module" to handle dynamic metadata.

This Cloudflare Worker serves as a reverse proxy server. It intercepts requests for dynamic pages, fetches the specific metadata from an endpoint, and updates the HTML file before sending it back to the browser. This effectively enables server-side rendering of metadata for better SEO and social media sharing.

## Configuration

The configuration is managed through a `config.js` file at the root of the project directory. This file contains settings for the source domain, metadata endpoint, and URL patterns.

### Configuration File (`config.js`)

```javascript
export const config = {
  domainSource: "https://f69a71f6-9fd8-443b-a040-78beb5d404d4.weweb-preview.io",
  metaDataEndpoint: "https://xeo6-2sgh-ehgj.n7.xano.io/api:8wD10mRd",
  patterns: {
    dynamicPage: "/event/[^/]+",
    pageData: "/public/data/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\.json"
  }
};
```
- domainSource: The base URL for fetching the original content.
- metaDataEndpoint: The API endpoint for fetching metadata.
- patterns: Regular expressions used to identify dynamic pages and page data.

## Worker Script
The main logic of the worker is contained in index.js. This script fetches and modifies web pages based on the URL patterns defined in the configuration file.

## Fetch Event Handler
The fetch event handler processes incoming requests, checks if the request URL matches specific patterns, and performs the necessary modifications.

```javascript
import { config } from './config.js';

export default {
  async fetch(request, env, ctx) {
    // Extracting configuration values
    const domainSource = config.domainSource;
    const metaDataEndpoint = config.metaDataEndpoint;
    const patterns = config.patterns;

    console.log("Worker started");

    // Parse the request URL
    const url = new URL(request.url);

    // Function to check if the URL matches the dynamic page pattern
    function isDynamicPage(url) {
      const pattern = new RegExp(patterns.dynamicPage);
      let pathname = url.pathname + (url.pathname.endsWith('/') ? '' : '/');
      return pattern.test(pathname);
    }

    // Function to check if the URL matches the page data pattern
    function isPageData(url) {
      const pattern = new RegExp(patterns.pageData);
      return pattern.test(url.pathname);
    }

    // Handle dynamic page requests
    if (isDynamicPage(url.pathname)) {
      console.log("Dynamic page detected:", url.pathname);

      // Fetch the source page content
      let source = await fetch(`${domainSource}${url.pathname}`);

      // Fetch metadata from the API endpoint
      let pathname = url.pathname + (url.pathname.endsWith('/') ? '' : '/');
      const metaDataResponse = await fetch(`${metaDataEndpoint}${pathname}meta`);
      const metadata = await metaDataResponse.json();
      console.log("Metadata fetched:", metadata);

      // Create a custom header handler with the fetched metadata
      const customHeaderHandler = new CustomHeaderHandler(metadata);

      // Transform the source HTML with the custom headers
      return new HTMLRewriter()
        .on('*', customHeaderHandler)
        .transform(source);

    // Handle page data requests
    } else if (isPageData(url.pathname) && isDynamicPage(url.searchParams.get('path') || '')) {
      console.log("Page data detected:", url.pathname);

      // Fetch the source data content
      const sourceResponse = await fetch(`${domainSource}${url.pathname}`);
      let sourceData = await sourceResponse.json();

      // Fetch metadata from the API endpoint
      let pathname = (url.searchParams.get('path') || '') + ((url.searchParams.get('path') || '').endsWith('/') ? '' : '/');
      console.log('Get the metadata from API: ', `${metaDataEndpoint}${pathname}meta`);
      const metaDataResponse = await fetch(`${metaDataEndpoint}${pathname}meta`);
      const metadata = await metaDataResponse.json();
      console.log("Metadata fetched for page data:", metadata);

      // Ensure nested objects exist in the source data
      sourceData.page = sourceData.page || {};
      sourceData.page.title = sourceData.page.title || {};
      sourceData.page.meta = sourceData.page.meta || {};
      sourceData.page.meta.desc = sourceData.page.meta.desc || {};
      sourceData.page.meta.keywords = sourceData.page.meta.keywords || {};
      sourceData.page.socialTitle = sourceData.page.socialTitle || {};
      sourceData.page.socialDesc = sourceData.page.socialDesc || {};

      // Update source data with the fetched metadata
      if (metadata.title) {
        sourceData.page.title.en = metadata.title;
        sourceData.page.socialTitle.en = metadata.title;
      }
      if (metadata.description) {
        sourceData.page.meta.desc.en = metadata.description;
        sourceData.page.socialDesc.en = metadata.description;
      }
      if (metadata.keywords) {
        sourceData.page.meta.keywords.en = metadata.keywords;
      }

      // Return the modified JSON object
      return new Response(JSON.stringify(sourceData), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If the URL does not match any patterns, fetch and return the original content
    console.log("Fetching original content for:", url.pathname);
    const sourceUrl = new URL(`${domainSource}${url.pathname}`);
    const sourceRequest = new Request(sourceUrl, request);
    const sourceResponse = await fetch(sourceRequest);

    return sourceResponse;
  }
};

// CustomHeaderHandler class to modify HTML content based on metadata
class CustomHeaderHandler {
  constructor(metadata) {
    this.metadata = metadata;
  }

  element(element) {
    if (element.tagName == "title") {
      console.log('Replacing title tag content');
      element.setInnerContent(this.metadata.title);
    }
    if (element.tagName == "meta") {
      const name = element.getAttribute("name");
      switch (name) {
        case "title":
          element.setAttribute("content", this.metadata.title);
          break;
        case "description":
          element.setAttribute("content", this.metadata.description);
          break;
        case "keywords":
          element.setAttribute("content", this.metadata.keywords);
          break;
      }

      const itemprop = element.getAttribute("itemprop");
      switch (itemprop) {
        case "name":
          element.setAttribute("content", this.metadata.title);
          break;
        case "description":
          element.setAttribute("content", this.metadata.description);
          break;
      }

      const type = element.getAttribute("property");
      switch (type) {
        case "og:title":
          console.log('Replacing og:title');
          element.setAttribute("content", this.metadata.title);
          break;
        case "og:description":
          console.log('Replacing og:description');
          element.setAttribute("content", this.metadata.description);
          break;
      }
    }
  }
}
```

### Explanation
1. Configuration File (config.js):
Contains configuration settings such as domainSource, metaDataEndpoint, and regex patterns for dynamicPage and pageData.

2. Worker Script (index.js):
- Imports Configuration: Imports settings from config.js.
- Request Handling:
  - Parses the request URL.
  - Determines whether the URL matches dynamicPage or pageData patterns using regex.
- Dynamic Page Handling:
  - If the request matches a dynamic page pattern, fetches the original page and metadata.
  - Uses `HTMLRewriter` to modify the HTML content based on the fetched metadata.
- Page Data Handling:
  - If the request matches a page data pattern, fetches the source data and metadata.
  - Updates the source data with the fetched metadata and returns the modified JSON.
- Default Handling:
  -If no patterns match, fetches and returns the original content.
- Custom Header Handler:
  - A class that uses HTMLRewriter to replace the content of <title> and <meta> tags in the HTML based on the fetched metadata.

3. Error Handling:
- Added checks to ensure url.searchParams and other potentially undefined objects are handled properly.
- Uses console.log statements to provide useful debugging information and track the flow of execution.

## Deployment
To deploy the worker, use the Cloudflare Wrangler CLI. Ensure you have the Cloudflare account and Wrangler CLI set up, then run:

```sh
npm run deploy
```

Or you can click the button below:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/WeWeb-Public/dynamic-metadata-with-cloudflare-worker)

## Contributing
Feel free to fork this repository and submit

