import { config } from '../config.js';

export default {
  async fetch(request, env, ctx) {
    const domainSource = config.domainSource;
    const patterns = config.patterns;

    console.log("Worker started");

    const url = new URL(request.url);
    const referer = request.headers.get('Referer');

    function getPatternConfig(url) {
      for (const patternConfig of patterns) {
        const regex = new RegExp(patternConfig.pattern);
        let pathname = url + (url.endsWith('/') ? '' : '/');
        if (regex.test(pathname)) {
          return patternConfig;
        }
      }
      return null;
    }

    function isPageData(url) {
      const pattern = /\/public\/data\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json/;
      return pattern.test(url);
    }

    async function requestMetadata(product_id, metaDataEndpoint, env) {
        try {
            // Construct the endpoint with the product_id as a query parameter
            const metaDataEndpointWithId = `${metaDataEndpoint}?product_id=${encodeURIComponent(product_id)}`;

            // Set up headers with the API token
            const headers = new Headers({
                "Authorization": `Bearer ${env.SUPABASE_API_TOKEN}`, // Use the stored token from environment variables
                "Content-Type": "application/json"
            });

            // Fetch metadata from the API endpoint
            const metaDataResponse = await fetch(metaDataEndpointWithId, { headers });
            
            if (!metaDataResponse.ok) {
                throw new Error(`Failed to fetch metadata: ${metaDataResponse.status} ${metaDataResponse.statusText}`);
            }

            const metadata = await metaDataResponse.json();
            return metadata;

        } catch (error) {
            console.error("Error fetching metadata:", error);
            return null; // Handle error gracefully
        }
    }

    const patternConfig = getPatternConfig(url.pathname);
    if (patternConfig) {
      console.log("Dynamic page detected:", url.pathname);

      // Extract product_id from the URL path
      const pathParts = url.pathname.split('/');
      const product_id = pathParts[pathParts.length - 1];  // Assuming product_id is the last part of the path

      // Fetch metadata for the extracted product_id
      const metadata = await requestMetadata(product_id, patternConfig.metaDataEndpoint, env);
      console.log("Metadata fetched:", metadata);

      // Fetch the source page content
      let source = await fetch(`${domainSource}${url.pathname}`);

      // Create a custom header handler with the fetched metadata
      const customHeaderHandler = new CustomHeaderHandler(metadata);

      // Transform the source HTML with the custom headers
      return new HTMLRewriter()
        .on('*', customHeaderHandler)
        .transform(source);

    } else if (isPageData(url.pathname)) {
        console.log("Page data detected:", url.pathname);
        console.log("Referer:", referer);

        const sourceResponse = await fetch(`${domainSource}${url.pathname}`);
        let sourceData = await sourceResponse.json();

        let pathname = referer;
        pathname = pathname ? pathname + (pathname.endsWith('/') ? '' : '/') : null;
        if (pathname !== null) {
            const patternConfigForPageData = getPatternConfig(pathname);
            if (patternConfigForPageData) {
                const pathParts = pathname.split('/');
                const product_id = pathParts[pathParts.length - 1];  // Extract product_id from the referer URL
                const metadata = await requestMetadata(product_id, patternConfigForPageData.metaDataEndpoint, env);
                console.log("Metadata fetched:", metadata);

                // Update source data with the fetched metadata (as before)
                sourceData.page = sourceData.page || {};
                sourceData.page.title = sourceData.page.title || {};
                sourceData.page.meta = sourceData.page.meta || {};
                sourceData.page.meta.desc = sourceData.page.meta.desc || {};
                sourceData.page.meta.keywords = sourceData.page.meta.keywords || {};
                sourceData.page.socialTitle = sourceData.page.socialTitle || {};
                sourceData.page.socialDesc = sourceData.page.socialDesc || {};

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

                console.log("Returning file: ", JSON.stringify(sourceData));
                return new Response(JSON.stringify(sourceData), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }
    }

    console.log("Fetching original content for:", url.pathname);
    const sourceUrl = new URL(`${domainSource}${url.pathname}`);
    const sourceRequest = new Request(sourceUrl, request);
    const sourceResponse = await fetch(sourceRequest);

    return sourceResponse;
  }
};

class CustomHeaderHandler {
  constructor(metadata) {
    this.metadata = metadata;
  }

  element(element) {
    // Replace the <title> tag content
    if (element.tagName == "title") {
      console.log('Replacing title tag content');
      element.setInnerContent(this.metadata.title);
    }
    // Replace meta tags content
    if (element.tagName == "meta") {
      const name = element.getAttribute("name");
      switch (name) {
        case "title":
          element.setAttribute("content", this.metadata.title);
          break;
        case "description":
          element.setAttribute("content", this.metadata.description);
          break;
        case "image":
          element.setAttribute("content", this.metadata.image);
          break;
        case "keywords":
          element.setAttribute("content", this.metadata.keywords);
          break;
        case "twitter:title":
          element.setAttribute("content", this.metadata.title);
          break;
        case "twitter:description":
          element.setAttribute("content", this.metadata.description);
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
        case "image":
          element.setAttribute("content", this.metadata.image);
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
        case "og:image":
          console.log('Replacing og:image');
          element.setAttribute("content", this.metadata.image);
          break;
      }
    }
  }
}
