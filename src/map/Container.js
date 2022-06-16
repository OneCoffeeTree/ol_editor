import React from 'react';

import { Map, View } from 'ol';
import 'ol/ol.css';
import { Vector as VectorSource, XYZ } from 'ol/source';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { transform } from 'ol/proj';
import OSM from 'ol/source/OSM';
import { Draw, Select, Modify, Translate, defaults, Snap } from 'ol/interaction';
import { Style, Stroke, Fill, Icon, Circle } from 'ol/style';
import { Point, MultiPoint } from 'ol/geom';
import RotateFeatureInteraction from 'ol-rotate-feature';

import LineSegment from 'jsts/org/locationtech/jts/geom/LineSegment';
import { GeoJSONWriter, GeoJSONReader, OL3Parser } from 'jsts/org/locationtech/jts/io';

import { Button, Select as SelectUI, MenuItem } from '@material-ui/core';

import editors from '../function/editor.js';

import arrow2 from '../assets/img/mapIcon/arrow2.png';
import mapIConMerge from '../assets/img/mapIcon/mapIConMerge.png';

class Container extends React.Component { // App.js 에서 렌더링 하는것이 Container 만 존재하기에 이곳에서 지도표시및 모든것을 다 처리

	state = {
		map: null,
		draw: null,
		drawLyr: null,
		select: null,
		anchorEl: null,
		popupTop: null,
		popupLeft: null,
		multi: false,
	}

	componentDidMount() {
		// layer와 mapp구성 mangoLyr를 osmLyr 대신 사용할수 있게 만들었으나, 현재는 불가
		const mangoLyr = new TileLayer({
			title: "MangoMap Grey",
			source: new XYZ({
				url: 'http://mango.iptime.org:8995/v.1.0.0/{z}/{x}/{y}.png?gray=true', // legacy 주소로 사용 불가
			}),
			visible: true
		})
		const osmLyr = new TileLayer({
			source: new OSM(),
		})

		const drawLyr = new VectorLayer({ // 객체가 그려지는 레이어 ?
			source: new VectorSource({
				wrapX: false // 화면상 동일한 좌표에 중복으로 도형 표시 안함
			}),
			style: feature => this.lineStyleFunc(feature, this.state.map), // lineStyleFunc은 스타일 지정 함수
			name: 'testLayer'
		})

		const map = new Map({
			target: 'map',
			layers: [osmLyr, drawLyr],
			view: new View({
				center: transform([process.env.REACT_APP_DEFAULT_MAP_CENTER_LON, process.env.REACT_APP_DEFAULT_MAP_CENTER_LAT], 'EPSG:4326', 'EPSG:3857'),
				zoom: process.env.REACT_APP_DEFAULT_MAP_ZOOM_LEVEL,
				minZoom: 8,
				maxZoom: 22,
				projection: 'EPSG:3857',
				interactions: defaults({})
			})
		});

		const select = new Select();

		map.addInteraction(select);
		select.on('select', this.selectFunc);
		map.getViewport().addEventListener('contextmenu', this.rightClick);
		map.on('click', () => {
			this.handleClosePopup();
			const this2 = this;
			this.state.map.getInteractions().forEach(function (interaction) {
				// 피쳐 이동 interaction 삭제
				if (interaction instanceof Translate) {  // instanceof 를 사용하여 interaction에 Translate에서 상속받는지? 확인?  (나중에 추가로 객체가 추가되면?? 코드 수정 필요?(OCP는?))
					this2.state.map.removeInteraction(interaction);
				} else if (interaction instanceof RotateFeatureInteraction) { // 피쳐 회전 interaction 삭제
					this2.state.map.removeInteraction(interaction);
				} else if(interaction instanceof Modify) { // 피쳐 수정 interaction 삭제
					this2.state.map.removeInteraction(interaction);
				}
			});
		})

		this.setState({ map, drawLyr, select }); // 26 ~ 35 줄에 선언해준 state에 값을 setState로 넣어줌
	}

	selectFunc = (e) => {
		if (e.target.getFeatures().getArray().length > 0) { // e.target.getFeatures().getArray().length : 선택한 피쳐의 개수
			let type = null;
			for (let i = 0; i < e.target.getFeatures().getArray().length; i++) {
				const feature = e.target.getFeatures().getArray()[i];
				// console.log(JSON.stringify(e.selected));
				// console.log(feature.getGeometry().getType());
				if (type === null) { // 최초 선택시
					type = feature.getGeometry().getType();
				} else if (type !== feature.getGeometry().getType()) { // 최초선택이후 기존 type과 신규 선택의 type이 맞지 않을 경우
					e.target.restorePreviousStyle_(e.target.getFeatures().getArray()[i]);
					e.target.getFeatures().getArray().splice(i, 1); // 
					e.selected.splice(0, 1); // splice를 이용해 제거
					alert('같은 타입의 피쳐만 선택할 수 있습니다.');
					return;
				}
			}
		}
	}

	// 그리기	// 상단의 point, linestring, polygon 버튼을 누르면 실행됨
	drawFunc = (type) => {
		const this2 = this;
		// console.log(this.state.map.getInteractions()); // drawFunc 가 동작하는 시점에서 select가 빠지기 때문에 log값이 달라질 수 있음
		// console.log(this.state.map.getInteractions().array_); 
		// console.log(this.state.map.getInteractions().array_[10]);
		// console.log(this.state.map.getInteractions().array_.length);
		this.state.map.getInteractions().forEach(function (interaction) { // interactions : [DragRotate, DoubleClickZoom, DragPan, PinchRotate, PinchZoom, KeyboardPan, KeyboardZoom, MouseWheelZoom, DragZoom, Draw, Snap]
			// console.log(interaction);
			if (interaction instanceof Draw) { // interaction 에 draw 클래스로부터 상속 받는?지 확인?? 	// this.state.map.interaction 에서 Draw를 제거
				this2.state.map.removeInteraction(interaction); 
			}
			// console.log("2");
			// console.log(interaction);
		})
		if (type) { // ? 
			this.state.map.removeInteraction(this.state.select);
			const draw = new Draw({
				source: this.state.drawLyr.getSource(),
				type
			});
			// console.log("3");
			// this.state.map.getInteractions().forEach(interaction=>{
			// 	console.log(interaction);
			// })
			
			const multi = this.state.multi;
			draw.on('drawend', function (e) {
				this2.state.map.removeInteraction(this);
				this2.state.map.addInteraction(this2.state.select);
			})
			
			this.state.map.addInteraction(draw);

			this.handleAddSnap();

			this.setState(draw);
		}
	}

	// 스타일
	lineStyleFunc = (feature, map) => { // 파라미터로 map을 받는 이유? 추후 확장을 위해?(질문할 것)
		// let geometry = map.getLayer().getsource().getfeature().getGeometry();  // ? 
		let geometry = feature.getGeometry();
		//let properties = feature.getProperties();
		let styles;
		if (geometry.getType().indexOf('Point') !== -1) { // getType()으로 유형을 가져오고 indexOf()를 이용하여 === 처럼 사용 getType()값이 Point 일 경우 geometry.getType().indexOf('Point')는 0이며 아닐경우 -1 ? ===가 아닌 indexOf를 사용한 이유?(질문할 것)
			styles = new Style({
				//point 의 style 값
				image: new Circle({ // point 생성시 보이는 원
					radius: 8,
					fill: new Fill({
						color: 'rgba(20, 20, 255, 0)'
					}),
					stroke: new Stroke({
						color: 'rgba(20, 20, 255, 1)', 
						width: 2
					})
				}),
			})
		} else if (geometry.getType().indexOf('LineString') !== -1) {
			styles = [
				// linestring
				new Style({
					stroke: new Stroke({
						color: 'rgba(255, 196, 20, 1)',
						width: 5
					}),
					fill: new Fill({
						color: 'rgba(255, 196, 20, 0.5)'
					})
				})
			];
		} else {
			styles = [
				// polygon
				new Style({
					stroke: new Stroke({
						color: 'rgba(255, 255, 255, 1)',
						width: 5
					}),
					fill: new Fill({
						color: 'rgba(255, 255, 255, 0.1)'
					})
				})
			];
		}

		// MultiLineString 스타일(화살표)
		if (geometry.getType().indexOf('MultiLineString') !== -1) {
			
			geometry.getCoordinates().forEach(function (coord) { // 각각의 포인트의 좌표값 getCoordinates() 통해 배열로 가져옴 
				for (let i = 0; i < coord.length - 1; i++) { // 포인트 개수 -1 반복
					const dx = coord[i + 1][0] - coord[i][0]; // i+1번째 포인트 좌표값 - i 번째 포인트 좌표값 => x증가량, y증가량
					const dy = coord[i + 1][1] - coord[i][1];
					let rotation = Math.atan2(dy, dx) * -1; // atan2(y,x) : (0,0)부터 (x,y)까지의 직선 그린후 x축부터 직선까지의 각을 라디안으로 리턴 (rotation * 180 / pi = 디그리값) (1,2 사분면 일때 양수 3,4분면 음수) (rotation이 시계방향으로 값이 증가하기때문에 -1을 곱함)

					const reader = new GeoJSONReader(); // ?? (질문할 것)
					const point1 = reader.read({ type: 'Point', coordinates: coord[i] }); // ?? //ex. {"_coordinates":{"_dimension":3,"_measures":0,"_coordinates":[{"x":14146005.199833848,"y":4510054.539026325,"z":null}]},"_envelope":null,"_userData":null,"_factory":{"_precisionModel":{"_modelType":{"_name":"FLOATING"},"_scale":null},"_coordinateSequenceFactory":{},"_SRID":0},"_SRID":0}
					const point2 = reader.read({ type: 'Point', coordinates: coord[i + 1] }); // ??  

					let midpoint = new LineSegment(point1.getCoordinates()[0], point2.getCoordinates()[0]).midPoint(); // i번째, i+1번째 좌표값을 받아 LineSegment을 만들고 중심점을 midpoint에 저장  // LineSegment : ?? (질문할 것)
					styles.push(new Style({
						geometry: new Point([midpoint.x, midpoint.y]), // i번째와 i+1번째의 중심에 생성
						image: new Icon({
							src: arrow2,
							anchor: [0.75, 0.5], // 아이콘의 위치 조정, 기본값은 0.5,0.5
							rotateWithView: true, // 아이콘 회전할지 여부 
							rotation // rotation 에 저장된 라디안값을 통해 화살표의 방향 결정, 
						})
					}));
				}
			});
			// LineString 스타일(화살표)
		} else if (geometry.getType().indexOf('LineString') !== -1) { // MultiLineString 일때와 유사함
			
			geometry.forEachSegment(function (start, end) {  // forEachSegment(): 각각의 선의 시작점과 끝점을 start, end 로 return 각각 (x,y) 형태
				var dx = end[0] - start[0]; // x증가량
				var dy = end[1] - start[1]; // y 증가량
				var rotation = Math.atan2(dy, dx) * -1; // 방향 구하기
				// arrows
				const reader = new GeoJSONReader();
				const point1 = reader.read({ type: 'Point', coordinates: start });
				const point2 = reader.read({ type: 'Point', coordinates: end });

				let midpoint = new LineSegment(point1.getCoordinates()[0], point2.getCoordinates()[0]).midPoint();  // 중심점 구하기

				styles.push(new Style({
					geometry: new Point([midpoint.x, midpoint.y]),
					image: new Icon({
						src: arrow2,
						anchor: [0.75, 0.5],
						rotateWithView: true,
						rotation
					})
				}));
			});

		}

		return styles;
	}

	//피쳐 회전 스타일
	createRotateStyle = () => { 
		let styles = {
			anchor: [],
			arrow: []
		}
		return function (feature, resolution) {		// feature 를 어디서 받아오는지? 위에 보면 아규먼트로 넣어주는게 없는것 같음 (질문할 것)
			let style;
			let angle = feature.get('angle') || 0;	// ? 무엇을 위한 angle?
			switch (true) {
				case feature.get('rotate-anchor'):
					style = styles['anchor'];		// styles의 anchor과 arrow는 모두 []로 비워져 있는데 style에 왜 넣는지 ?? 
					return style
				case feature.get('rotate-arrow'):
					style = styles['arrow'];
					return style;
				default:
					return;
			}
		}
	}

	// 오른쪽 클릭 팝업 이벤트
	rightClick = (e) => {
		e.preventDefault();
		let clickEvent = this.state.map.forEachFeatureAtPixel(this.state.map.getEventPixel(e),
			function (feature, layer) {
				return { feature, layer };
			});
		this.state.map.getInteractions().forEach(function (interaction) { 
			if (interaction instanceof Modify) { // 수정중 우클릭 다시 실행시	// 수정중이면 addinteraction 으로 interaction 이 Modify 도 상속 받았을것?
				alert('수정 종료후 다시 시도');
				clickEvent = null;
			}
		});
		// if (clickEvent && clickEvent.layer !== null) {
		// console.log(clickEvent);
		// console.log(clickEvent.layer);}
		if (clickEvent && clickEvent.layer !== null) {
			const feature = clickEvent.feature;	//
			let vectorLayer = clickEvent.layer;	// ? 일단 저장? 
			let select = this.state.select;
			let popupTop = null;
			let popupLeft = null;
			
			if (select && select.getFeatures().getArray().length > 1) {

			} else if (select) {
				select.getFeatures().clear();
				select.getFeatures().push(feature); 
			}
			//오른쪽 버튼 popup open 및 위치
			const anchorEl = e.currentTarget;
			if (feature.getGeometry().getType().indexOf('Polygon') !== -1) { // ? 조건에 따른 결과가 동일함 조건문을 건 이유?
				popupTop = e.clientY - 70;
			} else {
				popupTop = e.clientY - 70;
			}
			popupLeft = e.clientX;

			this.setState({ anchorEl, popupTop, popupLeft });
		}
	}

	//오른쪽 클릭 popup 닫기 // map.on(click)에 이 함수부터 실행하게 하여 지도를 누를경우 팝업창을 닫음
	handleClosePopup = () => {
		const select = this.state.select;
		//select.getFeatures().clear(); 
		this.setState({ anchorEl: null, select });
	};
	
	// 피쳐 이동
	handleFeatureMove = () => {
		this.handleClosePopup();
		editors.featureMove(this.state.map, this.state.select.getFeatures().getArray());
	}

	// 피쳐 회전
	handleFeatureRotate = (map, features) => {
		this.handleClosePopup();
		editors.rotate(map, features, this.createRotateStyle());
	}

	handleFeatureStraight = (features) => {
		this.handleClosePopup();
		for (let item of features) {
			editors.lineStraight(item);
		}
	}

	handleFeatureReverse = (features) => {
		this.handleClosePopup();
		for (let item of features) {
			editors.lineReverse(item);
		}
	}

	handleFeatureSimplify = (features) => {
		this.handleClosePopup();
		for (let item of features) {
			editors.simplify(item);
		}
	}

	handleFeatureReflect = (type, features) => {
		this.handleClosePopup();
		for (let item of features) {
			editors.reflect(type, item);
		}
	}

	handleFeatureSplit = (type, feature) => { // 수정중
		this.handleClosePopup();
		if (type.indexOf('LineString') !== -1) {
			editors.lineSplit(feature, this.state.map, this.state.select);
		} else if (type.indexOf('Polygon') !== -1) {
			editors.polygonSplit(feature, this.state.map, this.state.select);
		}
	}

	handleFeatureMerge = (type, features) => {
		this.handleClosePopup();
		if (type.indexOf('Point') !== -1) {
			editors.pointMerge(features, this.state.map);
		} else if (type.indexOf('LineString') !== -1) {
			editors.lineStringMerge(features, this.state.map);
		} else if (type.indexOf('Polygon') !== -1) {
			editors.polygonMerge(features, this.state.map);
		}
	}

	handleFeatureNodeSplit = (features) => {
		this.handleClosePopup();
		for (let item of features) {
			editors.lineNodeSplit(item, this.state.map);
		}
	}

	handleDelete = (features) => {
		this.handleClosePopup();
		for (let item of features) {
			editors.deleteFeature(item, this.state.map);
		}
	}

	handleFeatureEdit = (features) => {
		this.handleClosePopup();
		
		const modify = new Modify({
			features
		});
		this.state.map.addInteraction(modify);

		this.handleAddSnap();
	}

	// snap 이벤트
	handleAddSnap = () => {
		const this2 = this;
		this.state.map.getInteractions().forEach(function (interaction) {
			if(interaction instanceof Snap) {
				this2.state.map.removeInteraction(interaction);
			}
		})

		const snap = new Snap({
			source: this.state.drawLyr.getSource()
		})

		this.state.map.addInteraction(snap);
	}

	render() {
		const editToolOpen = Boolean(this.state.anchorEl);
		return (
			<>
				<div
					id="map"
					style={{
						width: "100%",
						height: "100%",
					}}>
				</div>
				<div style={{ position: 'absolute', top: 20, left: '37.5%', backgroundColor: 'rgba(158, 148, 152, 0.72)', width: '25%' }}>
					<Button variant="contained" color="primary" style={{ margin: 5 }} onClick={(e) => this.drawFunc(this.state.multi ? 'MultiPoint' : 'Point')}>Point</Button>
					<Button variant="contained" color="primary" style={{ margin: 5 }} onClick={(e) => this.drawFunc(this.state.multi ? 'MultiLineString' : 'LineString')}>LineString</Button>
					<Button variant="contained" color="primary" style={{ margin: 5 }} onClick={(e) => this.drawFunc(this.state.multi ? 'MultiPolygon' : 'Polygon')}>Polygon</Button>
					<SelectUI
						labelId="demo-simple-select-label"
						id="demo-simple-select"
						value={this.state.multi}
						onChange={(e) => { this.setState({ multi: e.target.value }) }}
					>
						<MenuItem value={false}>Single</MenuItem>
						<MenuItem value={true}>Multi</MenuItem>
					</SelectUI>
				</div>
				<ul
					className="contextMenuIcon"
					style={{ display: editToolOpen ? 'block' : 'none', top: this.state.popupTop, left: this.state.popupLeft }}
				>
					{
						// 라인일 때 편집
						this.state.select !== null
							&& this.state.select.getFeatures().getArray().length > 0
							&& this.state.select.getFeatures().getArray()[0].getGeometry().getType().indexOf('LineString') !== -1 ?
							<>
								<li onClick={() => this.handleFeatureStraight(this.state.select.getFeatures().getArray())}>
									직선화
								</li>
								<li onClick={() => this.handleFeatureReverse(this.state.select.getFeatures().getArray())}>
									방향반전
								</li>
								<li onClick={() => this.handleFeatureNodeSplit(this.state.select.getFeatures().getArray())}>
									노드별 분할
								</li>
							</>
							: null}
					{
						// 폴리곤, 라인일 때 편집 기능
						this.state.select !== null
							&& this.state.select.getFeatures().getArray().length > 0
							&& this.state.select.getFeatures().getArray()[0].getGeometry().getType().indexOf('Point') === -1 ?
							<>
								<li onClick={() => this.handleFeatureSimplify(this.state.select.getFeatures().getArray())}>
									단순화
								</li>
								<li onClick={() => this.handleFeatureReflect('short', this.state.select.getFeatures().getArray())}>
									짧은축 반전
								</li>
								<li onClick={() => this.handleFeatureReflect('long', this.state.select.getFeatures().getArray())}>
									긴축 반전
								</li>
								<li onClick={this.handleFeatureMove}>
									이동
								</li>
							</>
							: null}
					{
						this.state.select !== null
							&& this.state.select.getFeatures().getArray().length === 1
							&& this.state.select.getFeatures().getArray()[0].getGeometry().getType().indexOf('Point') === -1 ?
							<>
								<li onClick={() => this.handleFeatureRotate(this.state.map, this.state.select.getFeatures().getArray())}>
									회전
								</li>
								<li onClick={() => this.handleFeatureSplit(this.state.select.getFeatures().getArray()[0].getGeometry().getType(), this.state.select.getFeatures().getArray()[0])}>
									분할
								</li>
							</>
							: null}
					{
						// 2개 이상의 피쳐(같은 geometry type) 일 때 편집 
						this.state.select !== null
							&& this.state.select.getFeatures().getArray().length > 1
							?
							<li onClick={() => this.handleFeatureMerge(this.state.select.getFeatures().getArray()[0].getGeometry().getType(), this.state.select.getFeatures().getArray())}>
								병합
							</li>
							// 공통
							: null}
					{
						this.state.select !== null
							&& this.state.select.getFeatures().getArray().length > 0
							&& this.state.select.getFeatures().getArray()[0].getGeometry().getType() === 'MultiPoint' ?
							<li>
								분할
							</li>
							: null
					}
					{
						this.state.select !== null
							&& this.state.select.getFeatures().getArray().length === 1 ?
							<li onClick={() => this.handleFeatureEdit(this.state.select.getFeatures())}>
								수정
							</li>
							: null}
					<li onClick={() => this.handleDelete(this.state.select.getFeatures().getArray())}>
						삭제
					</li>
				</ul>
			</>
		)
	}
}

export default Container;