new DroneDeploy({ version: 1 }).then((dronedeployApi) => {
  const button = document.getElementById('button');
  const getTilesFromGeometry = (geometry, template, zoom) => {
    const long2tile = (lon, zoom) => (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)));
    const lat2tile = (lat, zoom) => (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)));
    const replaceInTemplate = point => template.replace('{z}', point.z)
      .replace('{x}', point.x)
      .replace('{y}', point.y);

    const allLat = geometry.map(point => point.lat);
    const allLng = geometry.map(point => point.lng);
    const minLat = Math.min.apply(null, allLat);
    const maxLat = Math.max.apply(null, allLat);
    const minLng = Math.min.apply(null, allLng);
    const maxLng = Math.max.apply(null, allLng);
    const topTile = lat2tile(maxLat, zoom); // eg.lat2tile(34.422, 9);
    const leftTile = long2tile(minLng, zoom);
    const bottomTile = lat2tile(minLat, zoom);
    const rightTile = long2tile(maxLng, zoom);

    const tiles = [];
    for (let y = topTile; y < bottomTile + 1; y++) {
      for (let x = leftTile; x < rightTile + 1; x++) {
        tiles.push(replaceInTemplate({ x, y, z: zoom }));
      }
    }
    return tiles;
  };
  // Get the Tiles
  const getTiles = (plan) => {
    const tiles = dronedeployApi.Tiles.get({ planId: plan.id, layerName: 'ortho', zoom: 18 });
    return Promise.all([tiles, plan]);
  };

  // Used Proxy server to deal with CORS
  const fetchTiles = ([tiles, plan]) => {
    const allTiles = getTilesFromGeometry(plan.geometry, tiles.template, 18);
    const fetchedTiles = allTiles.map(url => fetch(`https://drone-deploy-proxy-server.herokuapp.com/${url}`));
    return Promise.all(fetchedTiles);
  };

  // Changed all the Images to a Javascript Blob Object
  const turnUrlToBlob = response => Promise.all(response.map(imageObject => imageObject.blob()));

  // Convert the blob object to a DOMstring containing URL 
  const turnBlobToURL = blobs => Promise.all(blobs.map(blob => URL.createObjectURL(blob)));

  // Add all images into one PDF
  const convertToImage = (objectUrls) => {
    const createPicture = (doc, urls) => {
      const topMargin = 5;
      const imageSize = 50;
      const maxY = (imageSize * 4) + topMargin;
      let currentY = 50;
      let currentX = topMargin;

      return urls.map((url) => {
        const y = currentY;
        const x = currentX;

        currentX += imageSize;
        if (currentX >= maxY) {
          currentY += imageSize;
          currentX = topMargin;
        }

        return new Promise((resolve, reject) => {
          const image = new Image();
          image.src = url;

          image.onload = () => {
            doc.addImage(image, 'PNG', x, y, imageSize, imageSize);
            resolve();
          };
        });
      });
    };
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text(75, 20, 'Drone Deploy PDF Image');

    const tileImages = createPicture(doc, objectUrls);

    Promise.all(tileImages)
      .then((success) => {
        button.innerHTML = 'Generated!';
        doc.save('droneDeployMap.pdf');
      });
  };

  const errorHandling = (error) => {
    throw error;
  };

  // Adding Click Event to the button
  button.addEventListener('click', () => {
    button.innerHTML = 'Getting PDF...';
    dronedeployApi.Plans.getCurrentlyViewed()
      .then(getTiles)
      .then(fetchTiles)
      .then(turnUrlToBlob)
      .then(turnBlobToURL)
      .then(convertToImage)
      .catch(errorHandling);
  });
});
