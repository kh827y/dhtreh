# API.GetMeBack.Catalog 
Ниже описанное API позволяет работать с каталогом товаров GetMeBack: Получение списка заказов, обновление статусов заказов, загрузка и обновление каталога, загрузка и обновление товаров. 

Обмен данных с GetMeBack происходит с помощью POST https-запросов. Общий формат адреса для всех HTTP запросов: **https://[account].getmeback.ru/rest/base/v32/catalog/{method}** 

Тело запроса необходимо отправлять в формате application/json Ответ происходит в формате JSON. 

Обязательные параметры для всех POST запросов: 

|**Ключ** |**Значение** |**Описание** |
| - | - | - |
|api\_key |string |Ключ доступа к API GetMeBack. |
# Пример запроса к API: 
curl -H "Content-Type: application/json" -X POST -d '{"api\_key":"XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"}' https://[account].getmeback.ru/rest/base/v32/catalog/products ![](Aspose.Words.b35df25d-00c6-4b2d-80a3-060eeb80a9bb.001.png)
# Методы API: 
# ORDERS. Получение списка заказов 
Обновление статуса заказа 

URL запроса: *https://[account].getmeback.ru/rest/base/v32/catalog/orders* GET Параметры запроса: 

|**Ключ** |**Значение** |**Описание** |
| - | - | - |
|id\_order |[integer] |Номер заказа. Если передать то API вернёт информацию только по одному заказу |
|date\_start |[date(Y-m-d)] |Дата начала выгрузки. Будут отданы заказы, начиная с указанной даты |
|date\_end |[date(Y-m-d)] |Дата конца выгрузки выгрузки. Будут отданы заказы до указанной даты |
# UPDATE-STATUS. Обновление статуса заказа 
Обновление статуса заказа 

URL запроса: *https://[account].getmeback.ru/rest/base/v32/catalog/update-status* Параметры запроса: 

|**Ключ** |**Значение** |**Описание** |
| - | - | - |
|id\_order |integer |Номер заказа. Который нужно обновить |
|status |string (new|process|done|cancel) |<p>Новый статус заказа </p><p>**new** - Новый заказ </p><p>**process** - Заказ в обработке **done** - Заказ выполнен **cancel** - Заказ отменён </p>|
|notice |[string] |Заметка к заказу. Увидит только администратор  |

Возвращаемый HTTP статус:         200 - Статус изменён 

`        `404 - Заказ не найден 

`        `400 - Ошибка в запросе 
# GET-PRODUCTS. Получение списка товаров 
Метод для получения списка товаров с возможностью фильтрации и пагинации. URL запроса: *https://[account].getmeback.ru/rest/base/v32/catalog/get-products* 

1. *При использовании метода следует учитывать ограничения на количество записей (limit):* 
   1. *Минимальное значение: 1* 
   1. *Максимальное значение: 100* 
   1. *Значение по умолчанию: 20* 
1. *Постраничная навигация:* 
   1. *Параметр offset должен быть больше или равен 0* 
1. *Фильтрация:* 
- *При указании диапазона цен maxPrice не может быть меньше minPrice* 
- *Поиск по name осуществляется по частичному совпадению* 
- *Параметр withImages позволяет отфильтровать товары по наличию/отсутствию изображений* 

**Параметры запроса:** 

|**ключ** |**тип** |**обязательный** |**значение** |
| - | - | - | - |
|filters |object |Нет |Объект с параметрами фильтрации |
|limit |integer |Нет |Количество записей на странице. По умолчанию 20. Минимум 1, максимум 100 |
|offset |integer |Нет ||

**Параметры, вложенные в filters:** 



|**ключ** |**тип** |**обязательный** |**значение** |
| - | - | - | - |
|withImages |boolean |Нет |Фильтрация по наличию изображений |



|idCategory |integer |Нет |ID категории для фильтрации товаров |
| - | - | - | :- |
|minPrice |number |Нет |Минимальная цена товара |
|maxPrice |number |Нет |Максимальная цена товара |
|name |string |Нет ||

**Возвращаемые значения:** 



|**ключ** |**тип** |**значение** |
| - | - | - |
|success |boolean |true в случае успеха, false в случае ошибки |
|data |object |Объект с данными ответа |
|message |string ||

**Параметры, вложенные в data:** 



|**ключ** |**тип** |**значение** |
| - | - | - |
|items |array |Массив объектов с информацией о товарах |
|total |integer |Общее количество товаров, соответствующих фильтрам |
|limit |integer |Использованный лимит записей на странице |
|offset |integer ||

**Структура объекта товара в массиве items:** 



|**ключ** |**тип** |**значение** |
| - | - | - |
|id |string |Идентификатор товара |
|idCategory |string |Идентификатор категории |



|article |string |Артикул товара |
| - | - | - |
|name |string |Наименование товара |
|price |number |Цена товара |
|description |string |Описание товара |
|images |array |Массив ID изображений товара |
|isNew |boolean |Признак новинки |
|isPopular |boolean |Признак популярного товара |
|isRecommended |boolean |Признак острого товара |
|isSpicy |boolean |Признак вегетарианского товара |
|isVegan |boolean |Признак вегетарианского товара |
|weight |number |Вес товара |
|dimensions |object ||
|nutrition |object ||

**Пример запроса:** 

curl -i -H 'Content-Type: application/json' -X POST '[*~~https://test.getmeback.ru/rest/base/v32/catalog/get-products~~*](https://test.getmeback.ru/rest/base/v32/catalog/get-products)' 

Тело POST-запроса: 

{ 

"api\_key": "978c8e930e84b6b4837fce936483a328", "filters": { 

"categoryId": 5, 

"maxPrice": 1000, 

"withImages": true 

}, 

"limit": 50, 

"offset": 0 

Вы можете обратиться за помощью к вашему менеджеру  или по телефону +79119204699 ![ref1]
} 

**Пример успешного ответа:** 

HTTP/1.1 200 OK 

Date: Wed, 19 Dec 2018 12:08:12 GMT Content-Type: application/json;charset=utf-8 ... 

{ 

"success": true, 

"data": { 

"items": [ 

{ 

"id": "1", 

"categoryId": "5", 

"article": "ABC123", 

"name": "Тестовый товар", 

"price": 999.99, 

"description": "Описание товара", 

"images": [1, 2, 3], 

"isNew": true, 

"isPopular": false, 

"isRecommended": true, 

"isSpicy": false, 

"isVegan": true, 

"weight": 100, 

"dimensions": { 

"height": 10, 

"width": 20, 

"depth": 30 

}, 

"nutrition": { 

"protein": 20, 

Вы можете обратиться за помощью к вашему менеджеру  или по телефону +79119204699 ![ref1]

"fat": 10, 

"carbs": 30, 

"calories": 300 

} 

} 

], 

"total": 1, 

"limit": 50, 

"offset": 0 

}, 

"message": "Список товаров успешно получен" 

}

Вы можете обратиться за помощью к вашему менеджеру  или по телефону +79119204699 ![ref1]
# PRODUCTS. Создание/Изменение товара 
Метод создания/редактирования товара.  

URL запроса: *https://[account].getmeback.ru/rest/base/v32/catalog/products* **Параметры запроса:** 

|**Ключ** |**Тип** |**Обязательный** |**Значение** |
| - | - | - | - |
|products |array |Да |Список товаров |
|Параметры, вложенные в **products** ||||
|product |array |Да |Информация о товаре |
|Параметры, вложенные в **product** ||||
|id |string |Да |<p>Если товар с указанным id существует, то товар будет изменен. </p><p>Если товар с указанным id не существует, то товар будет создан с указанным id. </p>|
|idCategory |string |Да |Id категории |
|name |string |Да |Название |
|art |string |Нет |Артикул |
|price |double |Нет |Цена |
|branchPrice |array |Нет |<p>Массив стоимостей товара в различных торговых точках, где </p><p>price - double - Цена товара в ТТ idBranch - string - ID торговой точки в системе клиента. Параметр должен соответствовать параметру “Внешний ID” В редактировании торговой точки Пример: </p><p>[ </p><p>`   `{ </p><p>`      `idBranch: “branch1”, </p><p>`      `price: 100, </p><p>`      `amount: 25 </p><p>`   `}, </p><p>`   `{ </p><p>`      `idBranch: “branch2”, </p><p>`      `price: 110, </p><p>`      `amount: 88 </p><p>`   `}, </p><p>] </p><p>Если передано 0 - то цена товара будет 0 рублей. </p><p>Чтобы отменить изменение цены нужно </p>|



||||прислать null или не передавать это поле ||||
| :- | :- | :- | :- | :- | :- | :- |
|description |string |Нет |Описание ||||
|active |int ||Активность товара ||||
|order |int ||Заказ ||||
|isPopular |int ||Тег: популярный товар ||||
|isNew |int ||Тег: новый товар ||||
|isRecomended |int ||Тег: рекомендуемый товар ||||
|weight |int ||вес ||||
|height |int ||высота ||||
|width |int ||ширина ||||
|depth |int ||глубина ||||
|modifications |[array] |Нет |<p>Модификации товара. </p><p>У вариации товара должно быть минимум одно свойство. </p>||||
|Параметры, вложенные в **modifications:** |||||||
|**Ключ** |**Тип** |**Обязательный** |**Значение** ||||
|id |string |Да |ID Модификации. Для основной модификации должен совпадать с ID товара ||||
|active |bool |Нет |Активность вариации. Если не передано, вариация считается активной ||||
|art |string |Нет |Артикул. Если не передано, то значение будет взято из основного товара ||||
|price |double |Нет |Цена. Если не передано, то значение будет взято из основного товара ||||
|description |string |Нет |Описание. Если не передано, то значение будет взято из основного товара ||||
|weight |int |Нет |Вес. Если не передано, то значение будет взято из основного товара ||||
|height |int |Нет |Высота. Если не передано, то значение будет взято из основного товара ||||
||||||||


|width |int |Нет |Ширина. Если не передано, то значение будет взято из основного товара |
| - | - | - | :- |
|depth |int |Нет |Глубина. Если не передано, то значение будет взято из основного товара |
|protein |float |Нет |Белки. Если не передано, то значение будет взято из основного товара |
|fat |float |Нет |Жиры. Если не передано, то значение будет взято из основного товара |
|carbs |float |Нет |Углеводы. Если не передано, то значение будет взято из основного товара |
|calories |float |Нет |ККал. Если не передано, то значение будет взято из основного товара |
|properties |array |Да |<p>Массив свойств товара, где: </p><p>- **attribute** - название свойства </p><p>- **value** - значение свойства </p><p>Для каждой модификации должно быть передано минимум одно свойство. Пример: </p><p>`      `"properties": [{ </p><p>`            `"attribute" : "Цвет", </p><p>`            `"value" : "красный" </p><p>`        `}, { </p><p>`            `"attribute" : "Размер", </p><p>`            `"value" : "47" </p><p>`        `} </p><p>`      `] </p>|

**Возвращаемые значения:** 

|**Ключ** |**Значение** |**Описание** |
| - | - | - |
|result |string |“ok” в случае успеха “error” в случае неудачи |
|message |string |Информация об ошибке, если result = “error” |
|products |array |Возвращается массив сохраненных товаров |
|Параметры, вложенные в **products** |||
|status |string |“ok” в случае успеха “error” в случае неудачи |



|message |string |Информация об ошибке, если status = “error” |
| - | - | - |
|product |array |Возвращается сохраненный товар, если status = ‘ok’ |

**Пример:** Пример запроса: 

curl -i -H 'Content-Type: application/json' -X POST '*https://test.getmeback.ru/rest/base/v32/catalog/products*' 

Тело POST-запроса: 

-d '{ 

`  `"api\_key":"978c8e930e84b6b4837fce936483a328",   "products":[ 

`    `{ 

`      `"id": "testId1", 

`      `"idCategory": "3d", 

`      `"name": "Бургер", 

`      `"art": "123", 

`      `"price": "3000", 

`      `"description": "Описание бургера", 

`      `"order": "12", 

`      `"isPopular": "", 

`      `"isNew": "", 

`      `"isRecommended": "", 

`      `"weight": "2", 

`      `"height": "11", 

`      `"width": "12", 

`      `"depth": "13", 

`      `"active": "1" 

`    `},{ 

`      `"id": "testId2", 

`      `"idCategory": "3", 

`      `"name": "Салат цезарь", 

`      `"art": "1233", 

`      `"price": "3500", 

`      `"description": "Описание салата цезаря", 

`      `"order": "13", 

`      `"isPopular": "1", 

`      `"isNew": "1", 

`      `"isRecommended": "1", 

`      `"weight": "3", 

`      `"height": "14", 

`      `"width": "13", 

`      `"depth": "14", 

`      `"active": "1" 

`    `}, 

 

`  `] 

Вы можете обратиться за помощью к вашему менеджеру  или по телефону +79119204699 ![ref1]
}' 

Ответ: 

HTTP/1.1 200 OK 

Date: Wed, 19 Dec 2018 12:08:12 GMT Content-Type: application/json;charset=utf-8 ... 

{ 

`  `"result": "ok", 

`  `"products": { 

`    `"testId1": { 

`      `"status": "error", 

`      `"message": "Категория не найдена." 

`    `}, 

`    `"testId2": { 

`      `"status": "ok", 

`      `"product": { 

`        `"idCategory": "3", 

`        `"art": "1233", 

`        `"name": "Салат цезарь", 

`        `"price": "3500.00", 

`        `"description": "Описание салата цезаря",         "active": 1, 

`        `"isPopular": 1, 

`        `"order": 13, 

`        `"isNew": 1, 

`        `"isRecomended": null, 

`        `"weight": 3, 

`        `"height": 14, 

`        `"width": 13, 

`        `"depth": 14, 

`        `"id": "testId2" 

`      `} 

`    `}, 

 

`  `} 

} 
# GET-CATEGORIES. Получение списка категорий 
Метод для получения списка всех категорий.  

URL запроса: *https://[account].getmeback.ru/rest/base/v32/catalog/get-categories* 

**Возвращаемые значения:** 

|**Ключ** |**Значение** |**Описание** |
| - | - | - |

Вы можете обратиться за помощью к вашему менеджеру  или по телефону +79119204699 ![ref1]



|categories |array |<p>Массив категорий </p><p>**id** - ID категории </p><p>**idExt** - Внешний ID категории </p><p>**name** - Название категории **description** - Описание категории **idParent** - ID родительской категории </p>|
| - | - | - |

Вы можете обратиться за помощью к вашему менеджеру  или по телефону +79119204699 ![ref1]
# CATEGORIES. Создание/Изменение категорий 
Метод создания/редактирования категорий.  

URL запроса: *https://[account].getmeback.ru/rest/base/v32/catalog/categories* **Параметры запроса:** 

|**Ключ** |**Тип** |**Обязательный** |**Значение** |
| - | - | - | - |
|categories |array |Да |Список категорий |
|Параметры, вложенные в **categories** ||||
|category |array |Да |Информация о категории |
|Параметры, вложенные в **category** ||||
|id |string |Да |<p>Если категория с указанным id существует, то категория будет изменена. </p><p>Если категория с указанным id не существует, то категория будет создана с указанным id. </p>|
|name |string |Да |Название категории |
|idParent |string |Да |<p>Id родительской категории.  </p><p>Для корневых категорий (самого высокого уровня): idParent = 0. </p>|
|idBranch |int |Нет |№ филиала |
|description |string ||Описание |
|order |int ||Порядок |
|slug |string ||Алиас (Короткое латинское название,которое участвует в формировании URL для данной страницы). Если не указан, транслитерируется имя. |

**Возвращаемые значения:** 

|**Ключ** |**Значение** |**Описание** |
| - | - | - |
|result |string |“ok” в случае успеха “error” в случае неудачи |
|message |string |Информация об ошибке, если result = “error” |
|categories |array |Возвращается массив сохраненных категорий |

**Пример:** 

Пример запроса: 

curl -i -H 'Content-Type: application/json' -X POST '*https://test.getmeback.ru/rest/base/v32/catalog/categories*' 

Тело POST-запроса: 

-d '{ 

`  `"api\_key":"978c8e930e84b6b4837fce936483a328",   "categories": [ 

`    `{ 

`      `"id": "1AD2", 

`      `"name": "Имя категории", 

`      `"idParent":"0" 

`    `},{ 

`      `"id": "1AD3", 

`      `"name": "Имя категории", 

`      `"idParent":"12" 

`    `}, 

 

`  `] 

}' 

Ответ: 

HTTP/1.1 200 OK 

Date: Wed, 19 Dec 2018 12:08:12 GMT Content-Type: application/json;charset=utf-8 ... 

{ 

`  `"result": "ok", 

`  `"categories": { 

`    `"1AD2": { 

`      `"status": "ok", 

`      `"category": { 

`        `"name": "Имя категории", 

`        `"description": "", 

`        `"idParent": "2", 

`        `"order": 999, 

`        `"slug": "imya-kategorii", 

`        `"id": "1AD2" 

`      `} 

`    `}, 

`    `"1AD3": { 

`      `"status": "error", 

`      `"message": "Категории с указанным idParent (12) не существует."     }, 

 

`  `} 

} 
# ` `PRODUCT-UPLOAD-IMAGE. Загрузка фото товара 
Метод загрузки картинок товара.  

URL запроса: *https://[account].getmeback.ru/rest/base/v32/catalog/product-upload-image* **Параметры запроса:** 

|**Ключ** |**Тип** |**Обязательный** |**Значение** |
| - | - | - | - |
|id |string |Да |Id товара |
|images |array |Да |Массив фотографий: изображения в формате base64. |

**Возвращаемые значения:** 

|**Ключ** |**Значение** |**Описание** |
| - | - | - |
|result |string |“ok” в случае успеха “error” в случае неудачи |
|message |string |Информация об ошибке, если result = “error” |

**Пример:** Пример запроса: 

curl -i -H 'Content-Type: application/json' -X POST '*https://test.getmeback.ru/rest/base/v32/catalog/product-upload-image*' 

Тело POST-запроса: 

-d '{ 

"api\_key":"956c8e330e44b6b4937fce936483a12338", "id": "qwe", ![](Aspose.Words.b35df25d-00c6-4b2d-80a3-060eeb80a9bb.003.png)

"images": [ 

"data:image/jpeg;base64,/9j/4AAQS...”, "data:image/jpeg;base64,/9j/4AAQS...” 

] 

}' 

Ответ: 

HTTP/1.1 200 OK 

Date: Wed, 19 Dec 2018 12:08:12 GMT Content-Type: application/json;charset=utf-8 ... 

{ 

`  `"result": "ok" }
# CATEGORY-UPLOAD-IMAGE. Загрузка фото категории 
Метод загрузки картинок категории.  

URL запроса: *https://[account].getmeback.ru/rest/base/v32/catalog/category-upload-image* **Параметры запроса:** 

|**Ключ** |**Тип** |**Обязательный** |**Значение** |
| - | - | - | - |
|id |string |Да |Id категории |
|images |array |Да |Массив с одним элементом: изображение в формате base64. Если будет передано несколько изображений, сохранится последнее. |

**Возвращаемые значения:** 



|**Ключ** |**Значение** |**Описание** |
| - | - | - |
|result |string |“ok” в случае успеха “error” в случае неудачи |
|message |string |Информация об ошибке, если result = “error” |

**Пример:** Пример запроса: 

curl -i -H 'Content-Type: application/json' -X POST '*https://test.getmeback.ru/rest/base/v32/catalog/category-upload-image*' 

Тело POST-запроса: 

-d '{ 

"api\_key":"956c8e330e44b6b4937fce936483a12338", "id": "qwe", ![](Aspose.Words.b35df25d-00c6-4b2d-80a3-060eeb80a9bb.004.png)

"images": [ 

"data:image/jpeg;base64,/9j/4AAQS...” 

] 

}' 

Ответ: 

HTTP/1.1 200 OK 

Date: Wed, 19 Dec 2018 12:08:12 GMT Content-Type: application/json;charset=utf-8 ... 

{ 

`  `"result": "ok" } 
# PRODUCT-AMOUNTS. Обновление остатков и стоимости товара в торговой точке 
Данный метод позволяет передать в GetMeBack остатки товара в торговой точке, или задать персональную цену товара для торговой точки. Если применять в торговой точке модификатор не нужно, то параметр **price** передавать не нужно. 

URL запроса: *https://[account].getmeback.ru/rest/base/v32/catalog/product-amounts* 

**Параметры запроса:** 



|**Ключ** |**Тип** |**Обязательный** |**Значение** |
| - | - | - | - |
|amounts |array |Да |Список остатков |
|Параметры, вложенные в **amounts** ||||
|amount |array |Да |Информация об остатках товара |
|Параметры, вложенные в amount** ||||
|id|art |string |Да |<p>ID Или Артикул товара в системе клиента </p><p>Если передаётся ID товара, который был указан при создании товара(PRODUCTS) необходимо передать **id** </p><p>Для передачи остатков по артикулу необходимо передать **art** </p>|
|idBranch |string |Да |ID торговой точки в системе клиента. Параметр должен соответствовать параметру “Внешний ID” В редактировании торговой точки |
|amount |[integer] |Нет |Количество товара |
|price |[number] |Нет |<p>Цена товара в торговой точке. Если в ТТ не нужно менять стоимость, то данный параметр передавать не нужно. Если передано 0 - то цена товара будет 0 рублей. </p><p>Чтобы отменить изменение цены нужно прислать null или не передавать это поле </p>|

**Возвращаемые значения:** 

|**Ключ** |**Значение** |**Описание** |
| - | - | - |
|result |string |“ok” в случае успеха “error” в случае неудачи |



|errors |array |Информация об ошибках, если result = “error” |
| - | - | - |

**Пример запроса:** 

curl -H "Content-Type: application/json" -X POST -d '{ "api\_key":"XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", ![](Aspose.Words.b35df25d-00c6-4b2d-80a3-060eeb80a9bb.005.png)

"amounts": [ 

`    `{ 

`      `"id": "product\_1\_ext", 

`      `"idBranch": "branch\_1\_ext", 

`      `"amount": 100 

`    `}, 

`    `{ 

`      `"id": "product\_2\_ext", 

`      `"idBranch": "branch\_1\_ext", 

`      `"amount": 90 

`    `} 

`  `] 

}' https://[account].getmeback.ru/rest/base/v32/catalog/product-amounts 
Вы можете обратиться за помощью к вашему менеджеру  или по телефону +79119204699 ![ref1]

[ref1]: Aspose.Words.b35df25d-00c6-4b2d-80a3-060eeb80a9bb.002.png
