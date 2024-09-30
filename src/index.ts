// index.ts

import { config } from '../config.js';

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    // Accessing environment variables
    const SUPABASE_API_KEY = env.SUPABASE_API_KEY;
    const SUPABASE_AUTH_TOKEN = env.SUPABASE_AUTH_TOKEN;

    console.log("Worker started");
    console.log('SUPABASE_API_KEY is accessible:', SUPABASE_API_KEY ? 'Yes' : 'No');
    console.log('SUPABASE_AUTH_TOKEN is accessible:', SUPABASE_AUTH_TOKEN ? 'Yes' : 'No');

    // Parse the request URL
    const url = new URL(request.url);
    const referer = request.headers.get('Referer');

    // Exclude asset and API requests
    const excludedExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.otf'];
    const apiPrefixes = ['/ww/cms_data_sets/', '/api/', '/ww/'];

    function isAssetRequest(pathname: string): boolean {
      return excludedExtensions.some(ext => pathname.endsWith(ext));
    }

    function isApiRequest(pathname: string): boolean {
      return apiPrefixes.some(prefix => pathname.startsWith(prefix));
    }

    if (isAssetRequest(url.pathname) || isApiRequest(url.pathname)) {
      console.log('Non-HTML or API request, returning original content for:', url.pathname);
      return fetch(request);
    }

    // Extracting configuration values
    const domainSource = config.domainSource;
    const patterns = config.patterns;

    function getPatternConfig(pathname: string) {
      for (const patternConfig of patterns) {
        const regex = new RegExp(patternConfig.pattern);
        console.log(`Checking pattern ${patternConfig.pattern} against pathname ${pathname}`);
        if (regex.test(pathname)) {
          console.log(`Pattern matched: ${patternConfig.pattern}`);
          return patternConfig;
        }
      }
      console.log('No pattern matched');
      return null;
    }

    // Function to check if the URL matches the page data pattern
    function isPageData(pathname: string): boolean {
      const pattern = /\/public\/data\/[a-f0-9-]+\.json/;
      return pattern.test(pathname);
    }

    async function requestMetadata(urlPathname: string, metaDataEndpoint: string) {
      // Remove any trailing slash from the URL
      const trimmedUrl = urlPathname.replace(/\/$/, '');
      const parts = trimmedUrl.split('/');

      let id: string | null = null;

      // Determine the ID based on the URL structure
      if (trimmedUrl.startsWith('/product/')) {
        // Production URL structure: /product/{id}/
        id = parts[2]; // Index 0: '', Index 1: 'product', Index 2: '{id}'
      } else if (trimmedUrl.startsWith('/ww/cms_data_sets/')) {
        // Dev URL structure: /ww/cms_data_sets/{id}/fetch
        id = parts[3]; // Index 0: '', Index 1: 'ww', Index 2: 'cms_data_sets', Index 3: '{id}'
      } else {
        console.warn('Unrecognized URL structure for metadata extraction:', urlPathname);
        // Return null to indicate no metadata
        return null;
      }

      console.log('Fetching metadata for id:', id);

      // Fetch metadata from the Supabase RPC endpoint
      const metaDataResponse = await fetch(metaDataEndpoint, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_API_KEY,
          'Authorization': `Bearer ${SUPABASE_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: id }), // Pass the ID in the body as JSON
      });

      if (!metaDataResponse.ok) {
        const errorText = await metaDataResponse.text();
        console.error('Error fetching metadata:', metaDataResponse.status, metaDataResponse.statusText, errorText);
        // Return null to indicate failure
        return null;
      }

      const metadata = await metaDataResponse.json();
      console.log('Metadata response:', metadata);

      // Assuming the metadata is returned as an array, extract the first item
      return Array.isArray(metadata) ? metadata[0] : metadata;
    }

    // Handle dynamic page requests
    const patternConfig = getPatternConfig(url.pathname);
    if (patternConfig) {
      console.log("Dynamic page detected:", url.pathname);

      // Fetch the source page content
      const source = await fetch(`${domainSource}${url.pathname}`);

      let metadata;
      try {
        metadata = await requestMetadata(url.pathname, patternConfig.metaDataEndpoint);
        if (!metadata) {
          console.log('No metadata fetched, returning original content');
          return source;
        }
        console.log("Metadata fetched:", metadata);
      } catch (error) {
        console.error('Error fetching metadata:', error);
        // Return the original content if metadata fetch fails
        return source;
      }

      // Create a custom header handler with the fetched metadata
      const customHeaderHandler = new CustomHeaderHandler(metadata);

      // Transform the source HTML with the custom headers
      return new HTMLRewriter()
        .on('head > title', customHeaderHandler)
        .on('head > meta', customHeaderHandler)
        .transform(source);

    } else if (isPageData(url.pathname)) {
      console.log("Page data detected:", url.pathname);
      console.log("Referer:", referer);

      // Fetch the source data content
      const sourceResponse = await fetch(`${domainSource}${url.pathname}`);
      let sourceData = await sourceResponse.json();

      if (referer) {
        const refererUrl = new URL(referer);
        const pathname = refererUrl.pathname;
        const patternConfigForPageData = getPatternConfig(pathname);
        if (patternConfigForPageData) {
          let metadata;
          try {
            metadata = await requestMetadata(pathname, patternConfigForPageData.metaDataEndpoint);
            if (!metadata) {
              console.log('No metadata fetched for page data, returning original content');
              return new Response(JSON.stringify(sourceData), {
                headers: { 'Content-Type': 'application/json' }
              });
            }
            console.log("Metadata fetched:", metadata);
          } catch (error) {
            console.error('Error fetching metadata:', error);
            // Return the original content if metadata fetch fails
            return new Response(JSON.stringify(sourceData), {
              headers: { 'Content-Type': 'application/json' }
            });
          }

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
          if (metadata.image) {
            sourceData.page.metaImage = metadata.image;
          }
          if (metadata.keywords) {
            sourceData.page.meta.keywords.en = metadata.keywords;
          }

          console.log("Returning modified page data");
          // Return the modified JSON object
          return new Response(JSON.stringify(sourceData), {
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          console.log('No pattern matched for referer pathname');
        }
      } else {
        console.error('Referer header is missing');
      }

      // Return the original content if no pattern matched or referer is missing
      return new Response(JSON.stringify(sourceData), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If the URL does not match any patterns, fetch and return the original content
    console.log("Fetching original content for:", url.pathname);
    return fetch(request);
  }
};

// CustomHeaderHandler class to modify HTML content based on metadata
class CustomHeaderHandler {
  metadata: any;

  constructor(metadata: any) {
    this.metadata = metadata;
  }

  element(element: Element) {
    // Replace the <title> tag content
    if (element.tagName === "title") {
      console.log('Replacing title tag content');
      if (this.metadata.title) {
        element.setInnerContent(this.metadata.title);
      }
    }
    // Replace meta tags content
    if (element.tagName === "meta") {
      const name = element.getAttribute("name");
      const property = element.getAttribute("property");
      const itemprop = element.getAttribute("itemprop");

      if (name) {
        switch (name) {
          case "title":
          case "twitter:title":
            if (this.metadata.title) {
              element.setAttribute("content", this.metadata.title);
            }
            break;
          case "description":
          case "twitter:description":
            if (this.metadata.description) {
              element.setAttribute("content", this.metadata.description);
            }
            break;
          case "image":
            if (this.metadata.image) {
              element.setAttribute("content", this.metadata.image);
            }
            break;
          case "keywords":
            if (this.metadata.keywords) {
              element.setAttribute("content", this.metadata.keywords);
            }
            break;
          case "robots":
            // Ensure there is a 'noindex' meta tag
            if (!element.getAttribute("content") || !element.getAttribute("content")!.includes("noindex")) {
              console.log('Adding noindex to robots meta tag');
              element.setAttribute("content", (element.getAttribute("content") || '') + ', noindex');
            }
            break;
          default:
            break;
        }
      }

      if (itemprop) {
        switch (itemprop) {
          case "name":
            if (this.metadata.title) {
              element.setAttribute("content", this.metadata.title);
            }
            break;
          case "description":
            if (this.metadata.description) {
              element.setAttribute("content", this.metadata.description);
            }
            break;
          case "image":
            if (this.metadata.image) {
              element.setAttribute("content", this.metadata.image);
            }
            break;
          default:
            break;
        }
      }

      if (property) {
        switch (property) {
          case "og:title":
            console.log('Replacing og:title');
            if (this.metadata.title) {
              element.setAttribute("content", this.metadata.title);
            }
            break;
          case "og:description":
            console.log('Replacing og:description');
            if (this.metadata.description) {
              element.setAttribute("content", this.metadata.description);
            }
            break;
          case "og:image":
            console.log('Replacing og:image');
            if (this.metadata.image) {
              element.setAttribute("content", this.metadata.image);
            }
            break;
          default:
            break;
        }
      }
    }
  }
}
