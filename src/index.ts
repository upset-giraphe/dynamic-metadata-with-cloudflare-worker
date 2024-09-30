import { config } from '../config.js';

export default {
  async fetch(request, env, ctx) {
    // Extracting configuration values
    const domainSource = config.domainSource;
    const patterns = config.patterns;

    console.log("Worker started");

    // Accessing environment variables for Supabase
    const SUPABASE_API_KEY = env.SUPABASE_API_KEY;
    const SUPABASE_AUTH_TOKEN = env.SUPABASE_AUTH_TOKEN;

		console.log('SUPABASE_API_KEY is accessible:', SUPABASE_API_KEY ? 'Yes' : 'No');
		console.log('SUPABASE_AUTH_TOKEN is accessible:', SUPABASE_AUTH_TOKEN ? 'Yes' : 'No');

    // Parse the request URL
    const url = new URL(request.url);
    const referer = request.headers.get('Referer');

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
      const pattern = /\/public\/data\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json/;
      return pattern.test(pathname);
    }

    async function requestMetadata(urlPathname, metaDataEndpoint) {
      // Remove any trailing slash from the URL
      const trimmedUrl = urlPathname.replace(/\/$/, '');

      // Extract the product ID from the URL
      const parts = trimmedUrl.split('/');
      const id = parts[parts.length - 1];

      console.log('Fetching metadata for id:', id);

      // Fetch metadata from the Supabase RPC endpoint
      const metaDataResponse = await fetch(metaDataEndpoint, {
        method: 'POST', // Use POST method for RPC calls
        headers: {
          'apikey': SUPABASE_API_KEY,
          'Authorization': `Bearer ${SUPABASE_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: id }), // Pass the ID in the body as JSON
      });

      if (!metaDataResponse.ok) {
        console.error('Error fetching metadata:', metaDataResponse.statusText);
        throw new Error(`Error fetching metadata: ${metaDataResponse.statusText}`);
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
        .on('*', customHeaderHandler)
        .transform(source);

    // Handle page data requests for the WeWeb app
    } else if (isPageData(url.pathname)) {
      console.log("Page data detected:", url.pathname);
      console.log("Referer:", referer);

      // Fetch the source data content
      const sourceResponse = await fetch(`${domainSource}${url.pathname}`);
      let sourceData = await sourceResponse.json();

      let pathname = referer;
      pathname = pathname ? new URL(pathname).pathname : null;
      if (pathname !== null) {
        const patternConfigForPageData = getPatternConfig(pathname);
        if (patternConfigForPageData) {
          let metadata;
          try {
            metadata = await requestMetadata(pathname, patternConfigForPageData.metaDataEndpoint);
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
        }
      }
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
