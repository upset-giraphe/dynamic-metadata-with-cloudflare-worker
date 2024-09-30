import { config } from '../config.js';

export default {
  async fetch(request, env, ctx) {
    // Accessing environment variables for Supabase
    const SUPABASE_API_KEY = env.SUPABASE_API_KEY;
    const SUPABASE_AUTH_TOKEN = env.SUPABASE_AUTH_TOKEN;

    // Extracting configuration values
    const domainSource = config.domainSource;
    const patterns = config.patterns;

    console.log("Worker started");
    console.log('SUPABASE_API_KEY is accessible:', SUPABASE_API_KEY ? 'Yes' : 'No');
    console.log('SUPABASE_AUTH_TOKEN is accessible:', SUPABASE_AUTH_TOKEN ? 'Yes' : 'No');

    // Parse the request URL
    const url = new URL(request.url);
    const referer = request.headers.get('Referer');

    // Exclude asset and API requests
    const excludedExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.otf'];

    function isAssetRequest(pathname) {
      return excludedExtensions.some(ext => pathname.endsWith(ext));
    }

    const apiPrefixes = ['/ww/cms_data_sets/', '/api/', '/ww/'];

    function isApiRequest(pathname) {
      return apiPrefixes.some(prefix => pathname.startsWith(prefix));
    }

    if (isAssetRequest(url.pathname) || isApiRequest(url.pathname)) {
      console.log('Non-HTML request, returning original content for:', url.pathname);
      return await fetch(request);
    }

    function getPatternConfig(pathname) {
      for (const patternConfig of patterns) {
        const regex = new RegExp(patternConfig.pattern);
        console.log(`Checking pattern ${patternConfig.pattern} against pathname ${pathname}`); // Debug log
        if (regex.test(pathname)) {
          console.log(`Pattern matched: ${patternConfig.pattern}`); // Debug log
          return patternConfig;
        }
      }
      console.log('No pattern matched'); // Debug log
      return null;
    }

    // Function to check if the URL matches the page data pattern (For the WeWeb app)
    function isPageData(pathname) {
      const pattern = /\/public\/data\/[a-f0-9-]+\.json/;
      return pattern.test(pathname);
    }

    async function requestMetadata(urlPathname, metaDataEndpoint) {
      // ... existing code with modified error handling ...
      // If URL structure is unrecognized, return null
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

    // Handle page data requests for the WeWeb app
    } else if (isPageData(url.pathname)) {
      // ... existing code with necessary adjustments ...
    }

    // If the URL does not match any patterns, fetch and return the original content
    console.log("Fetching original content for:", url.pathname);
    return await fetch(request);
  }
};

// CustomHeaderHandler class remains the same, but ensure it only modifies intended elements

// CustomHeaderHandler class to modify HTML content based on metadata
class CustomHeaderHandler {
  constructor(metadata) {
    this.metadata = metadata;
  }

  element(element) {
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
            if (element.getAttribute("content") === "noindex") {
              console.log('Removing noindex tag');
              element.remove();
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
